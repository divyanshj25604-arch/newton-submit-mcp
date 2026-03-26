import axios, { AxiosError, AxiosInstance } from "axios";
import {
  AssignmentQuestionRef,
  Problem,
  SubmissionResponse,
  SubmissionStatus,
} from "./types.js";

const DEFAULT_BASE_URL = "https://my.newtonschool.co";
const DEFAULT_SUBMIT_POLL_ATTEMPTS = 8;
const DEFAULT_SUBMIT_POLL_INTERVAL_MS = 1200;

function getAuthHeaders() {
  const sessionCookie = process.env.NEWTON_SESSION_COOKIE;
  const bearer = process.env.NEWTON_AUTH_TOKEN;

  if (!sessionCookie && !bearer) {
    throw new Error(
      "Missing auth: set NEWTON_SESSION_COOKIE (e.g., 'session=...') or NEWTON_AUTH_TOKEN (Bearer token)."
    );
  }

  const headers: Record<string, string> = {};
  if (sessionCookie) headers["Cookie"] = sessionCookie;
  if (bearer) headers["Authorization"] = `Bearer ${bearer}`;
  return headers;
}

function createClient(): AxiosInstance {
  const baseURL = process.env.NEWTON_BASE_URL ?? DEFAULT_BASE_URL;

  return axios.create({
    baseURL,
    timeout: 15000,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
  });
}

function getDefaultCourseHash() {
  return process.env.NEWTON_COURSE_HASH?.trim();
}

function getDefaultUsername() {
  return process.env.NEWTON_USERNAME?.trim();
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function maybeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseProblemRef(problemId: string): {
  courseHash?: string;
  assignmentHash?: string;
  questionOrPlaygroundHash: string;
} {
  const trimmed = problemId.trim();
  if (!trimmed) {
    throw new Error("problemId cannot be empty");
  }

  const splitter = trimmed.includes(":")
    ? ":"
    : trimmed.includes("/")
      ? "/"
      : null;

  if (!splitter) {
    return { questionOrPlaygroundHash: trimmed };
  }

  const parts = trimmed.split(splitter).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2) {
    return {
      assignmentHash: parts[0],
      questionOrPlaygroundHash: parts[1],
    };
  }
  if (parts.length === 3) {
    return {
      courseHash: parts[0],
      assignmentHash: parts[1],
      questionOrPlaygroundHash: parts[2],
    };
  }
  return { questionOrPlaygroundHash: trimmed };
}

function parseSubmissionRef(submissionId: string): {
  playgroundHash: string;
  requestedSubmissionHash?: string;
} {
  const [playgroundHash, requestedSubmissionHash] = submissionId
    .split(":")
    .map((x) => x.trim());

  if (!playgroundHash) {
    throw new Error(
      "Invalid submissionId. Expected '<playgroundHash>' or '<playgroundHash>:<submissionHash>'."
    );
  }

  return {
    playgroundHash,
    requestedSubmissionHash: requestedSubmissionHash || undefined,
  };
}

function toExamples(raw: unknown): Problem["examples"] {
  const items = asArray<Record<string, unknown>>(raw);
  const examples = items
    .map((item) => {
      const input = firstString(
        item.input,
        item.stdin,
        item.sample_input,
        item.input_text
      );
      const output = firstString(
        item.output,
        item.stdout,
        item.sample_output,
        item.output_text
      );
      if (!input || !output) return null;
      return {
        input,
        output,
        explanation: firstString(item.explanation, item.notes),
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  return examples.length ? examples : undefined;
}

function normalizeProblemFromPlayground(
  rawPlayground: Record<string, unknown>,
  fallbackId: string
): Problem {
  const assignmentQuestion = isObject(rawPlayground.assignment_question)
    ? rawPlayground.assignment_question
    : undefined;
  const question = isObject(assignmentQuestion?.question)
    ? assignmentQuestion.question
    : undefined;

  const title =
    firstString(
      question?.title,
      assignmentQuestion?.title,
      rawPlayground.title,
      fallbackId
    ) ?? fallbackId;

  const description =
    firstString(
      question?.description,
      question?.statement,
      assignmentQuestion?.description,
      rawPlayground.description,
      rawPlayground.problem_statement
    ) ?? "";

  const constraints = firstString(
    question?.constraints,
    assignmentQuestion?.constraints,
    rawPlayground.constraints
  );

  const examples =
    toExamples(question?.examples) ??
    toExamples(question?.sample_test_cases) ??
    toExamples(rawPlayground.examples);

  return {
    id:
      firstString(
        rawPlayground.hash,
        assignmentQuestion?.hash,
        rawPlayground.id,
        fallbackId
      ) ?? fallbackId,
    title,
    description,
    constraints,
    examples,
  };
}

function normalizeAssignmentQuestions(
  assignment: Record<string, unknown>
): AssignmentQuestionRef[] {
  const assignmentHash = firstString(assignment.hash, assignment.assignment_hash);
  if (!assignmentHash) return [];

  const assignmentTitle = firstString(
    assignment.title,
    assignment.name,
    assignment.assignment_title
  );

  const questions: AssignmentQuestionRef[] = [];
  for (const question of asArray<Record<string, unknown>>(assignment.assignment_questions)) {
    const questionHash = firstString(question.hash, question.assignment_question_hash);
    if (!questionHash) continue;
    questions.push({
      assignmentHash,
      assignmentTitle,
      questionHash,
      questionTitle: firstString(question.title, question.name),
      questionType: firstString(question.question_type, question.type),
    });
  }
  return questions;
}

function normalizeAssignments(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(isObject);
  }
  if (!isObject(payload)) return [];

  const directKeys = ["assignments", "results", "data", "items"] as const;
  for (const key of directKeys) {
    if (Array.isArray(payload[key])) {
      return payload[key].filter(isObject);
    }
  }

  const merged: Record<string, unknown>[] = [];
  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isObject(item)) merged.push(item);
      }
    }
  }
  return merged;
}

function isPendingBuild(raw: Record<string, unknown>): boolean {
  const buildStatus = firstString(raw.build_status, raw.status, raw.result)?.toUpperCase();
  if (!buildStatus) return false;
  return buildStatus === "PENDING" || buildStatus === "RUNNING" || buildStatus === "PROCESSING";
}

function normalizeSubmissionStatus(raw: Record<string, unknown>): SubmissionStatus {
  const statusText = firstString(raw.status, raw.result, raw.build_status, raw.current_status);
  const numeric = maybeNumber(raw.status_id ?? raw.current_status);
  let normalized: SubmissionStatus["status"] = "Pending";

  if (numeric === 3) normalized = "Accepted";
  else if (numeric === 4) normalized = "Wrong Answer";
  else if (numeric === 5) normalized = "TLE";
  else if (numeric === 11) normalized = "Runtime Error";
  else if (numeric === 6 || numeric === 7 || numeric === 8 || numeric === 10 || numeric === 12)
    normalized = "Runtime Error";
  else if (numeric === 13) normalized = "Compilation Error";
  else if (statusText) {
    const upper = statusText.toUpperCase();
    if (upper.includes("ACCEPT")) normalized = "Accepted";
    else if (upper.includes("WRONG")) normalized = "Wrong Answer";
    else if (upper.includes("TIME_LIMIT") || upper.includes("TLE")) normalized = "TLE";
    else if (upper.includes("RUNTIME")) normalized = "Runtime Error";
    else if (upper.includes("COMPIL")) normalized = "Compilation Error";
    else if (upper.includes("SUCCESS")) normalized = "Accepted";
    else normalized = "Pending";
  }

  return {
    status: normalized,
    runtime: maybeNumber(raw.runtime ?? raw.time ?? raw.execution_time),
    memory: maybeNumber(raw.memory ?? raw.memory_used),
    raw,
  };
}

function buildLatestSubmissionPath(playgroundHash: string): string {
  const username = getDefaultUsername();
  if (username) {
    return `/api/v1/playground/coding/h/${encodeURIComponent(
      playgroundHash
    )}/latest_submission/?username=${encodeURIComponent(username)}`;
  }
  return `/api/v1/playground/coding/h/${encodeURIComponent(playgroundHash)}/latest_submission/`;
}

async function fetchPlaygroundByHash(
  client: AxiosInstance,
  playgroundHash: string
): Promise<Record<string, unknown>> {
  const response = await withRetry(() =>
    client.get(`/api/v1/playground/coding/h/${encodeURIComponent(playgroundHash)}/`)
  );
  if (!isObject(response.data)) {
    throw new Error("Unexpected playground response from Newton API");
  }
  return response.data;
}

async function listAssignmentsRaw(
  client: AxiosInstance,
  courseHash: string
): Promise<Record<string, unknown>[]> {
  const response = await withRetry(() =>
    client.get(
      `/api/v2/course/h/${encodeURIComponent(
        courseHash
      )}/assignment/all/?pagination=false&completed=false`
    )
  );
  return normalizeAssignments(response.data);
}

async function resolveAssignmentForQuestionHash(
  client: AxiosInstance,
  courseHash: string,
  questionHash: string
): Promise<Record<string, unknown> | undefined> {
  const assignments = await listAssignmentsRaw(client, courseHash);
  return assignments.find((assignment) =>
    asArray<Record<string, unknown>>(assignment.assignment_questions).some(
      (q) => firstString(q.hash, q.assignment_question_hash) === questionHash
    )
  );
}

async function fetchAssignmentQuestionDetails(
  client: AxiosInstance,
  params: {
    courseHash: string;
    assignmentHash: string;
    questionHash: string;
  }
): Promise<Record<string, unknown>> {
  const { courseHash, assignmentHash, questionHash } = params;
  const response = await withRetry(() =>
    client.get(
      `/api/v1/course/h/${encodeURIComponent(
        courseHash
      )}/assignment/h/${encodeURIComponent(
        assignmentHash
      )}/question/h/${encodeURIComponent(questionHash)}/details/`
    )
  );
  if (!isObject(response.data)) {
    throw new Error("Unexpected assignment question details response from Newton API");
  }
  return response.data;
}

async function resolvePlayground(
  client: AxiosInstance,
  params: {
    problemId: string;
    courseHash?: string;
    assignmentHash?: string;
  }
): Promise<{
  playgroundHash: string;
  courseHash?: string;
  assignmentHash?: string;
  assignmentQuestionHash?: string;
  playground: Record<string, unknown>;
}> {
  const parsed = parseProblemRef(params.problemId);
  const requestedHash = parsed.questionOrPlaygroundHash;
  const courseHash = params.courseHash ?? parsed.courseHash ?? getDefaultCourseHash();
  const assignmentHashInput = params.assignmentHash ?? parsed.assignmentHash;

  try {
    const playground = await fetchPlaygroundByHash(client, requestedHash);
    const resolvedPlaygroundHash =
      firstString(playground.hash, requestedHash) ?? requestedHash;
    return {
      playgroundHash: resolvedPlaygroundHash,
      courseHash,
      assignmentHash: assignmentHashInput,
      playground,
    };
  } catch (err) {
    if (!axios.isAxiosError(err) || err.response?.status !== 404) {
      throw normalizeError(err);
    }
  }

  if (!courseHash) {
    throw new Error(
      "Could not resolve problemId as playground hash. Provide courseHash (or set NEWTON_COURSE_HASH) to resolve assignment question hashes."
    );
  }

  let assignmentHash = assignmentHashInput;
  if (!assignmentHash) {
    const assignment = await resolveAssignmentForQuestionHash(
      client,
      courseHash,
      requestedHash
    );
    assignmentHash = firstString(assignment?.hash);
  }

  if (!assignmentHash) {
    throw new Error(
      `Unable to find assignment for question hash '${requestedHash}' in course '${courseHash}'.`
    );
  }

  const questionDetails = await fetchAssignmentQuestionDetails(client, {
    courseHash,
    assignmentHash,
    questionHash: requestedHash,
  });
  const playgroundHash = firstString(
    questionDetails.hash,
    questionDetails.playground_hash,
    questionDetails.playgroundHash
  );
  if (!playgroundHash) {
    throw new Error("Newton API did not provide playground hash for assignment question");
  }

  const playground = await fetchPlaygroundByHash(client, playgroundHash);
  return {
    playgroundHash,
    courseHash,
    assignmentHash,
    assignmentQuestionHash: requestedHash,
    playground,
  };
}

function collectLanguageMappings(playground: Record<string, unknown>): Array<Record<string, unknown>> {
  const assignmentQuestion = isObject(playground.assignment_question)
    ? playground.assignment_question
    : undefined;
  const languageLists: unknown[] = [
    assignmentQuestion?.assignment_question_language_mappings,
    assignmentQuestion?.language_mappings,
    playground.assignment_question_language_mappings,
    playground.language_mappings,
    playground.languages,
  ];

  const mappings: Array<Record<string, unknown>> = [];
  for (const list of languageLists) {
    for (const item of asArray<Record<string, unknown>>(list)) {
      mappings.push(item);
    }
  }
  return mappings;
}

function resolveLanguageId(playground: Record<string, unknown>, language: string): number {
  const directNumeric = maybeNumber(language);
  if (directNumeric !== undefined) return directNumeric;

  const target = language.trim().toLowerCase();
  const aliases: Record<string, string[]> = {
    javascript: ["javascript", "js", "node", "nodejs"],
    typescript: ["typescript", "ts"],
    python: ["python", "py"],
    cpp: ["cpp", "c++"],
    c: ["c"],
    java: ["java"],
    go: ["go", "golang"],
    csharp: ["csharp", "c#", "cs"],
    rust: ["rust"],
    mysql: ["mysql", "sql"],
  };

  const acceptable = new Set<string>();
  acceptable.add(target);
  for (const [base, values] of Object.entries(aliases)) {
    if (values.includes(target)) {
      values.forEach((v) => acceptable.add(v));
      acceptable.add(base);
    }
  }

  const mappings = collectLanguageMappings(playground);
  for (const mapping of mappings) {
    const languageId = maybeNumber(mapping.language_id ?? mapping.id);
    if (languageId === undefined) continue;
    const candidates = [
      firstString(mapping.slug),
      firstString(mapping.language_slug),
      firstString(mapping.language_text),
      firstString(mapping.language_name),
      firstString(mapping.name),
      isObject(mapping.language)
        ? firstString(
            (mapping.language as Record<string, unknown>).slug,
            (mapping.language as Record<string, unknown>).name,
            (mapping.language as Record<string, unknown>).language_name
          )
        : undefined,
    ]
      .filter((x): x is string => Boolean(x))
      .map((x) => x.toLowerCase());

    if (candidates.some((x) => acceptable.has(x))) {
      return languageId;
    }
  }

  const existing = maybeNumber(playground.language_id);
  if (existing !== undefined) return existing;

  throw new Error(
    `Unable to map language '${language}' to Newton language_id for this problem. Pass numeric language id instead.`
  );
}

async function fetchLatestSubmissionRaw(
  client: AxiosInstance,
  playgroundHash: string
): Promise<Record<string, unknown>> {
  const response = await withRetry(() => client.get(buildLatestSubmissionPath(playgroundHash)));
  if (!isObject(response.data)) {
    throw new Error("Unexpected latest_submission response from Newton API");
  }
  return response.data;
}

async function pollLatestSubmission(
  client: AxiosInstance,
  playgroundHash: string
): Promise<Record<string, unknown>> {
  const maxAttempts = maybeNumber(process.env.NEWTON_SUBMIT_POLL_ATTEMPTS) ??
    DEFAULT_SUBMIT_POLL_ATTEMPTS;
  const intervalMs = maybeNumber(process.env.NEWTON_SUBMIT_POLL_INTERVAL_MS) ??
    DEFAULT_SUBMIT_POLL_INTERVAL_MS;

  let latest: Record<string, unknown> = {};
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    latest = await fetchLatestSubmissionRaw(client, playgroundHash);
    if (!isPendingBuild(latest)) return latest;
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  return latest;
}

function encodeSubmissionId(
  playgroundHash: string,
  latestSubmission: Record<string, unknown>
): string {
  const submissionHash =
    firstString(
      latestSubmission.hash,
      latestSubmission.submission_hash,
      latestSubmission.id,
      latestSubmission.token
    ) ?? "latest";
  return `${playgroundHash}:${submissionHash}`;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 400): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    await new Promise((res) => setTimeout(res, delayMs));
    return withRetry(fn, retries - 1, delayMs * 2);
  }
}

function normalizeError(err: unknown): Error {
  if (axios.isAxiosError(err)) {
    const axErr = err as AxiosError;
    if (axErr.response?.status === 401) {
      return new Error("Unauthorized: Newton session is invalid or expired");
    }
    const status = axErr.response?.status;
    const message =
      axErr.response?.data && typeof axErr.response.data === "object"
        ? JSON.stringify(axErr.response.data)
        : axErr.message;
    return new Error(`Newton API error${status ? " (" + status + ")" : ""}: ${message}`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

export async function fetchProblem(
  problemId: string,
  options?: { courseHash?: string; assignmentHash?: string }
): Promise<Problem> {
  try {
    const client = createClient();
    const resolved = await resolvePlayground(client, {
      problemId,
      courseHash: options?.courseHash,
      assignmentHash: options?.assignmentHash,
    });
    return normalizeProblemFromPlayground(resolved.playground, problemId);
  } catch (err) {
    throw normalizeError(err);
  }
}

export async function listAssignmentQuestions(
  courseHashInput?: string
): Promise<AssignmentQuestionRef[]> {
  try {
    const client = createClient();
    const courseHash = courseHashInput ?? getDefaultCourseHash();
    if (!courseHash) {
      throw new Error(
        "Missing course hash. Pass courseHash or set NEWTON_COURSE_HASH."
      );
    }

    const assignments = await listAssignmentsRaw(client, courseHash);
    return assignments.flatMap((assignment) => normalizeAssignmentQuestions(assignment));
  } catch (err) {
    throw normalizeError(err);
  }
}

export async function submitSolution(
  problemId: string,
  language: string,
  code: string,
  options?: { courseHash?: string; assignmentHash?: string }
): Promise<SubmissionResponse> {
  try {
    const client = createClient();
    const resolved = await resolvePlayground(client, {
      problemId,
      courseHash: options?.courseHash,
      assignmentHash: options?.assignmentHash,
    });
    const languageId = resolveLanguageId(resolved.playground, language);

    const payload: Record<string, unknown> = {
      hash: resolved.playgroundHash,
      language_id: languageId,
      source_code: code,
      run_hidden_test: true,
      showSubmissionTab: true,
      is_force_save: true,
    };
    const lastSavedAt = firstString(resolved.playground.last_saved_at);
    if (lastSavedAt) {
      payload.last_saved_at = lastSavedAt;
    }

    await withRetry(() =>
      client.patch(
        `/api/v1/playground/coding/h/${encodeURIComponent(
          resolved.playgroundHash
        )}/?run_hidden_test_cases=true`,
        payload
      )
    );

    const latest = await pollLatestSubmission(client, resolved.playgroundHash);
    return {
      submissionId: encodeSubmissionId(resolved.playgroundHash, latest),
      playgroundHash: resolved.playgroundHash,
      raw: latest,
    };
  } catch (err) {
    throw normalizeError(err);
  }
}

export async function getSubmissionStatus(submissionId: string): Promise<SubmissionStatus> {
  try {
    const client = createClient();
    const { playgroundHash } = parseSubmissionRef(submissionId);
    const latest = await fetchLatestSubmissionRaw(client, playgroundHash);
    return normalizeSubmissionStatus(latest);
  } catch (err) {
    throw normalizeError(err);
  }
}
