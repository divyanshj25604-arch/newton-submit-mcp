import axios from "axios";
import { getNewtonAuthHeaders } from "./auth.js";
const DEFAULT_BASE_URL = "https://my.newtonschool.co";
const DEFAULT_SUBMIT_POLL_ATTEMPTS = 8;
const DEFAULT_SUBMIT_POLL_INTERVAL_MS = 1200;
const PLAYGROUND_KIND_FALLBACKS = ["coding", "react", "frontend", "project"];
function normalizePlaygroundKind(value) {
    if (!value)
        return undefined;
    const normalized = value.trim().toLowerCase();
    if (!normalized)
        return undefined;
    if (normalized.includes("project") ||
        normalized.includes("newton-box") ||
        normalized.includes("newton_box") ||
        normalized.includes("newtonbox")) {
        return "project";
    }
    if (normalized.includes("react"))
        return "react";
    if (normalized.includes("frontend") || normalized.includes("front_end") || normalized === "fe") {
        return "frontend";
    }
    if (normalized.includes("coding") || normalized.includes("dsa"))
        return "coding";
    const safeSlug = normalized.replace(/[^a-z0-9_-]/g, "");
    return safeSlug || undefined;
}
function uniquePlaygroundKinds(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        if (!value)
            continue;
        if (seen.has(value))
            continue;
        seen.add(value);
        result.push(value);
    }
    return result;
}
function buildPlaygroundKindCandidates(preferredKinds = []) {
    return uniquePlaygroundKinds([
        ...preferredKinds,
        ...PLAYGROUND_KIND_FALLBACKS,
    ]);
}
function isPlaygroundKindMiss(err) {
    if (!axios.isAxiosError(err))
        return false;
    const status = err.response?.status;
    return status === 404 || status === 405;
}
function normalizeBaseUrl(value) {
    const base = (value ?? DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
    if (!base)
        return DEFAULT_BASE_URL;
    if (base.endsWith("/api/v1") || base.endsWith("/api/v2")) {
        return base.replace(/\/api\/v[0-9]+$/, "");
    }
    return base;
}
function createClient(auth) {
    const baseURL = normalizeBaseUrl(process.env.NEWTON_BASE_URL);
    return axios.create({
        baseURL,
        timeout: 15000,
        headers: {
            "Content-Type": "application/json",
            ...getNewtonAuthHeaders(auth),
        },
    });
}
function getDefaultCourseHash() {
    return process.env.NEWTON_COURSE_HASH?.trim();
}
function getDefaultUsername() {
    return process.env.NEWTON_USERNAME?.trim();
}
function asArray(value) {
    return Array.isArray(value) ? value : [];
}
function isObject(value) {
    return Boolean(value) && typeof value === "object";
}
function firstString(...values) {
    for (const value of values) {
        if (typeof value === "string" && value.trim())
            return value.trim();
    }
    return undefined;
}
function uniqueStrings(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        if (!value)
            continue;
        const trimmed = value.trim();
        if (!trimmed || seen.has(trimmed))
            continue;
        seen.add(trimmed);
        result.push(trimmed);
    }
    return result;
}
function maybeNumber(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return undefined;
}
function maybeBoolean(value) {
    if (typeof value === "boolean")
        return value;
    if (typeof value === "number")
        return value !== 0;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true" || normalized === "1" || normalized === "yes")
            return true;
        if (normalized === "false" || normalized === "0" || normalized === "no")
            return false;
    }
    return undefined;
}
function maybeJsonObject(value) {
    const trimmed = value.trim();
    if (!trimmed.startsWith("{"))
        return undefined;
    try {
        const parsed = JSON.parse(trimmed);
        return isObject(parsed) ? parsed : undefined;
    }
    catch {
        return undefined;
    }
}
function parseProblemRef(problemId) {
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
function parseSubmissionRef(submissionId) {
    const [playgroundRef, requestedSubmissionHash] = submissionId
        .split(":")
        .map((x) => x.trim());
    if (!playgroundRef) {
        throw new Error("Invalid submissionId. Expected '<playgroundHash>' or '<playgroundHash>:<submissionHash>' (optionally '<kind>/<playgroundHash>:<submissionHash>').");
    }
    let playgroundKind;
    let playgroundHash = playgroundRef;
    const slashIndex = playgroundRef.indexOf("/");
    if (slashIndex > 0 && slashIndex < playgroundRef.length - 1) {
        const maybeKind = normalizePlaygroundKind(playgroundRef.slice(0, slashIndex));
        const hashPart = playgroundRef.slice(slashIndex + 1).trim();
        if (maybeKind && hashPart) {
            playgroundKind = maybeKind;
            playgroundHash = hashPart;
        }
    }
    return {
        playgroundKind,
        playgroundHash,
        requestedSubmissionHash: requestedSubmissionHash || undefined,
    };
}
function extractPlaygroundKindHints(source) {
    if (!source)
        return [];
    const assignmentQuestion = isObject(source.assignment_question)
        ? source.assignment_question
        : undefined;
    const question = isObject(assignmentQuestion?.question)
        ? assignmentQuestion.question
        : undefined;
    return uniquePlaygroundKinds([
        normalizePlaygroundKind(firstString(source.playground_type, source.playground_kind, source.question_type, source.type, source.editor_type)),
        normalizePlaygroundKind(firstString(assignmentQuestion?.playground_type, assignmentQuestion?.playground_kind, assignmentQuestion?.question_type, assignmentQuestion?.type)),
        normalizePlaygroundKind(firstString(isObject(question) ? question.playground_type : undefined, isObject(question) ? question.question_type : undefined, isObject(question) ? question.type : undefined)),
    ]);
}
function toExamples(raw) {
    const items = asArray(raw);
    const examples = items
        .map((item) => {
        const input = firstString(item.input, item.stdin, item.sample_input, item.input_text);
        const output = firstString(item.output, item.stdout, item.sample_output, item.output_text);
        if (!input || !output)
            return null;
        return {
            input,
            output,
            explanation: firstString(item.explanation, item.notes),
        };
    })
        .filter((x) => Boolean(x));
    return examples.length ? examples : undefined;
}
function normalizeProblemFromPlayground(rawPlayground, fallbackId) {
    const assignmentQuestion = isObject(rawPlayground.assignment_question)
        ? rawPlayground.assignment_question
        : undefined;
    const question = isObject(assignmentQuestion?.question)
        ? assignmentQuestion.question
        : undefined;
    const title = firstString(question?.title, question?.question_title, assignmentQuestion?.title, assignmentQuestion?.question_title, rawPlayground.title, fallbackId) ?? fallbackId;
    const description = firstString(question?.description, question?.statement, question?.question_text, assignmentQuestion?.description, assignmentQuestion?.question_text, rawPlayground.description, rawPlayground.problem_statement) ?? "";
    const constraints = firstString(question?.constraints, assignmentQuestion?.constraints, rawPlayground.constraints);
    const examples = toExamples(question?.examples) ??
        toExamples(question?.sample_test_cases) ??
        toExamples(rawPlayground.examples);
    return {
        id: firstString(rawPlayground.hash, assignmentQuestion?.hash, rawPlayground.id, fallbackId) ?? fallbackId,
        title,
        description,
        constraints,
        examples,
    };
}
function normalizeAssignmentQuestions(assignment) {
    const assignmentHash = firstString(assignment.hash, assignment.assignment_hash);
    if (!assignmentHash)
        return [];
    const assignmentTitle = firstString(assignment.title, assignment.name, assignment.assignment_title);
    const questions = [];
    for (const question of asArray(assignment.assignment_questions)) {
        const questionHash = firstString(question.hash, question.assignment_question_hash);
        if (!questionHash)
            continue;
        questions.push({
            assignmentHash,
            assignmentTitle,
            questionHash,
            questionTitle: firstString(question.title, question.question_title, question.name),
            questionType: firstString(question.question_type, question.type),
        });
    }
    return questions;
}
function normalizeAssignments(payload) {
    if (Array.isArray(payload)) {
        return payload.filter(isObject);
    }
    if (!isObject(payload))
        return [];
    const directKeys = ["assignments", "results", "data", "items"];
    for (const key of directKeys) {
        if (Array.isArray(payload[key])) {
            return payload[key].filter(isObject);
        }
    }
    const merged = [];
    for (const value of Object.values(payload)) {
        if (Array.isArray(value)) {
            for (const item of value) {
                if (isObject(item))
                    merged.push(item);
            }
        }
    }
    return merged;
}
function isPendingBuild(raw) {
    const buildStatus = firstString(raw.build_status, raw.status, raw.result)?.toUpperCase();
    if (!buildStatus)
        return false;
    return buildStatus === "PENDING" || buildStatus === "RUNNING" || buildStatus === "PROCESSING";
}
function normalizeSubmissionStatus(raw) {
    const statusText = firstString(raw.status, raw.result, raw.build_status, raw.current_status);
    const numeric = maybeNumber(raw.status_id ?? raw.current_status);
    const assignmentQuestionMapping = isObject(raw.assignment_course_user_question_mapping)
        ? raw.assignment_course_user_question_mapping
        : undefined;
    const milestoneQuestionMapping = isObject(raw.milestone_user_question_mapping)
        ? raw.milestone_user_question_mapping
        : undefined;
    const isCompleted = maybeBoolean(raw.completed ??
        assignmentQuestionMapping?.completed ??
        milestoneQuestionMapping?.completed);
    const allTestCasesPassed = maybeBoolean(raw.all_test_cases_passed ??
        raw.allTestCasesPassed ??
        assignmentQuestionMapping?.all_test_cases_passed ??
        assignmentQuestionMapping?.allTestCasesPassed ??
        milestoneQuestionMapping?.all_test_cases_passed ??
        milestoneQuestionMapping?.allTestCasesPassed);
    let normalized = "Pending";
    if (numeric === 3)
        normalized = "Accepted";
    else if (numeric === 4)
        normalized = "Wrong Answer";
    else if (numeric === 5)
        normalized = "TLE";
    else if (numeric === 11)
        normalized = "Runtime Error";
    else if (numeric === 6 || numeric === 7 || numeric === 8 || numeric === 10 || numeric === 12)
        normalized = "Runtime Error";
    else if (numeric === 13)
        normalized = "Compilation Error";
    else if (statusText) {
        const upper = statusText.toUpperCase();
        if (upper.includes("ACCEPT"))
            normalized = "Accepted";
        else if (upper.includes("WRONG"))
            normalized = "Wrong Answer";
        else if (upper.includes("TIME_LIMIT") || upper.includes("TLE"))
            normalized = "TLE";
        else if (upper.includes("RUNTIME"))
            normalized = "Runtime Error";
        else if (upper.includes("COMPIL"))
            normalized = "Compilation Error";
        else if (upper.includes("SUCCESS"))
            normalized = "Accepted";
        else
            normalized = "Pending";
    }
    if (normalized === "Pending") {
        if (allTestCasesPassed === true || isCompleted === true) {
            normalized = "Accepted";
        }
        else if (allTestCasesPassed === false) {
            normalized = "Wrong Answer";
        }
    }
    return {
        status: normalized,
        runtime: maybeNumber(raw.runtime ?? raw.time ?? raw.execution_time),
        memory: maybeNumber(raw.memory ?? raw.memory_used),
        raw,
    };
}
function buildPlaygroundPath(playgroundHash, playgroundKind) {
    return `/api/v1/playground/${encodeURIComponent(playgroundKind)}/h/${encodeURIComponent(playgroundHash)}/`;
}
function buildLatestSubmissionPath(playgroundHash, playgroundKind) {
    const basePath = `${buildPlaygroundPath(playgroundHash, playgroundKind)}latest_submission/`;
    const username = getDefaultUsername();
    if (username) {
        return `${basePath}?username=${encodeURIComponent(username)}`;
    }
    return basePath;
}
function buildSubmitPath(playgroundHash, playgroundKind) {
    return `${buildPlaygroundPath(playgroundHash, playgroundKind)}?run_hidden_test_cases=true`;
}
async function fetchPlaygroundByHash(client, playgroundHash, preferredKinds = []) {
    const candidates = buildPlaygroundKindCandidates(preferredKinds);
    let lastMiss;
    for (const playgroundKind of candidates) {
        try {
            const response = await withRetry(() => client.get(buildPlaygroundPath(playgroundHash, playgroundKind)), 2, 400, (err) => !isPlaygroundKindMiss(err));
            if (!isObject(response.data)) {
                throw new Error("Unexpected playground response from Newton API");
            }
            return { playground: response.data, playgroundKind };
        }
        catch (err) {
            if (isPlaygroundKindMiss(err)) {
                lastMiss = err;
                continue;
            }
            throw err;
        }
    }
    if (lastMiss)
        throw lastMiss;
    throw new Error(`Unable to fetch playground '${playgroundHash}'.`);
}
async function listAssignmentsRaw(client, courseHash) {
    const response = await withRetry(() => client.get(`/api/v2/course/h/${encodeURIComponent(courseHash)}/assignment/all/?pagination=false&completed=false`));
    return normalizeAssignments(response.data);
}
function extractSubjectHashFromAssignment(assignment) {
    if (!assignment)
        return undefined;
    const course = isObject(assignment.course) ? assignment.course : undefined;
    const subject = isObject(assignment.subject) ? assignment.subject : undefined;
    return firstString(assignment.subject_hash, assignment.course_hash, course?.subject_hash, course?.hash, subject?.hash);
}
async function findAssignmentByHash(client, courseHash, assignmentHash) {
    const assignments = await listAssignmentsRaw(client, courseHash);
    return assignments.find((assignment) => firstString(assignment.hash, assignment.assignment_hash) === assignmentHash);
}
async function resolveAssignmentForQuestionHash(client, courseHash, questionHash) {
    const assignments = await listAssignmentsRaw(client, courseHash);
    return assignments.find((assignment) => asArray(assignment.assignment_questions).some((q) => firstString(q.hash, q.assignment_question_hash) === questionHash));
}
async function fetchAssignmentQuestionDetails(client, params) {
    const { courseHashCandidates, assignmentHash, questionHash } = params;
    const candidates = uniqueStrings(courseHashCandidates);
    if (!candidates.length) {
        throw new Error("Missing course/subject hash while resolving assignment question details.");
    }
    let lastMiss;
    for (const courseHash of candidates) {
        try {
            const response = await withRetry(() => client.get(`/api/v1/course/h/${encodeURIComponent(courseHash)}/assignment/h/${encodeURIComponent(assignmentHash)}/question/h/${encodeURIComponent(questionHash)}/details/`), 2, 400, (err) => {
                if (!axios.isAxiosError(err))
                    return true;
                const status = err.response?.status;
                if (!status)
                    return true;
                if (status === 429 || status >= 500)
                    return true;
                return false;
            });
            if (!isObject(response.data)) {
                throw new Error("Unexpected assignment question details response from Newton API");
            }
            return { details: response.data, resolvedCourseHash: courseHash };
        }
        catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 404) {
                lastMiss = err;
                continue;
            }
            throw err;
        }
    }
    if (lastMiss)
        throw lastMiss;
    throw new Error("Unable to fetch assignment question details from Newton API.");
}
async function resolvePlayground(client, params) {
    const parsed = parseProblemRef(params.problemId);
    const requestedHash = parsed.questionOrPlaygroundHash;
    const courseHashInput = params.courseHash ?? parsed.courseHash ?? getDefaultCourseHash();
    const assignmentHashInput = params.assignmentHash ?? parsed.assignmentHash;
    const preferredKinds = params.preferredPlaygroundKind
        ? [params.preferredPlaygroundKind]
        : [];
    try {
        const fetched = await fetchPlaygroundByHash(client, requestedHash, preferredKinds);
        const resolvedPlaygroundHash = firstString(fetched.playground.hash, requestedHash) ?? requestedHash;
        return {
            playgroundKind: fetched.playgroundKind,
            playgroundHash: resolvedPlaygroundHash,
            courseHash: courseHashInput,
            assignmentHash: assignmentHashInput,
            playground: fetched.playground,
        };
    }
    catch (err) {
        if (!isPlaygroundKindMiss(err)) {
            throw normalizeError(err);
        }
    }
    if (!courseHashInput) {
        throw new Error("Could not resolve problemId as playground hash. Provide courseHash (or set NEWTON_COURSE_HASH) to resolve assignment question hashes.");
    }
    let assignmentHash = assignmentHashInput;
    let assignment;
    if (!assignmentHash) {
        assignment = await resolveAssignmentForQuestionHash(client, courseHashInput, requestedHash);
        assignmentHash = firstString(assignment?.hash);
    }
    else {
        assignment = await findAssignmentByHash(client, courseHashInput, assignmentHash);
    }
    if (!assignmentHash) {
        throw new Error(`Unable to find assignment for question hash '${requestedHash}' in course '${courseHashInput}'.`);
    }
    const questionDetailsResult = await fetchAssignmentQuestionDetails(client, {
        courseHashCandidates: uniqueStrings([
            extractSubjectHashFromAssignment(assignment),
            courseHashInput,
        ]),
        assignmentHash,
        questionHash: requestedHash,
    });
    const questionDetails = questionDetailsResult.details;
    const playgroundHash = firstString(questionDetails.hash, questionDetails.playground_hash, questionDetails.playgroundHash);
    if (!playgroundHash) {
        throw new Error("Newton API did not provide playground hash for assignment question");
    }
    const hintedKinds = uniquePlaygroundKinds([
        ...preferredKinds,
        ...extractPlaygroundKindHints(questionDetails),
    ]);
    const fetched = await fetchPlaygroundByHash(client, playgroundHash, hintedKinds);
    return {
        playgroundKind: fetched.playgroundKind,
        playgroundHash,
        courseHash: questionDetailsResult.resolvedCourseHash,
        assignmentHash,
        assignmentQuestionHash: requestedHash,
        playground: fetched.playground,
    };
}
function collectLanguageMappings(playground) {
    const assignmentQuestion = isObject(playground.assignment_question)
        ? playground.assignment_question
        : undefined;
    const languageLists = [
        assignmentQuestion?.assignment_question_language_mappings,
        assignmentQuestion?.language_mappings,
        playground.assignment_question_language_mappings,
        playground.language_mappings,
        playground.languages,
    ];
    const mappings = [];
    for (const list of languageLists) {
        for (const item of asArray(list)) {
            mappings.push(item);
        }
    }
    return mappings;
}
function resolveLanguageId(playground, language, options) {
    const directNumeric = maybeNumber(language);
    if (directNumeric !== undefined)
        return directNumeric;
    const target = language.trim().toLowerCase();
    if (!target && options?.allowMissing)
        return undefined;
    if (!target)
        throw new Error("language cannot be empty");
    const aliases = {
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
    const acceptable = new Set();
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
        if (languageId === undefined)
            continue;
        const candidates = [
            firstString(mapping.slug),
            firstString(mapping.language_slug),
            firstString(mapping.language_text),
            firstString(mapping.language_name),
            firstString(mapping.name),
            isObject(mapping.language)
                ? firstString(mapping.language.slug, mapping.language.name, mapping.language.language_name)
                : undefined,
        ]
            .filter((x) => Boolean(x))
            .map((x) => x.toLowerCase());
        if (candidates.some((x) => acceptable.has(x))) {
            return languageId;
        }
    }
    const existing = maybeNumber(playground.language_id);
    if (existing !== undefined)
        return existing;
    if (options?.allowMissing)
        return undefined;
    throw new Error(`Unable to map language '${language}' to Newton language_id for this problem. Pass numeric language id instead.`);
}
async function fetchLatestSubmissionRaw(client, playgroundHash, preferredKinds = []) {
    const candidates = buildPlaygroundKindCandidates(preferredKinds);
    let lastMiss;
    for (const playgroundKind of candidates) {
        try {
            const response = await withRetry(() => client.get(buildLatestSubmissionPath(playgroundHash, playgroundKind)), 2, 400, (err) => !isPlaygroundKindMiss(err));
            if (!isObject(response.data)) {
                throw new Error("Unexpected latest_submission response from Newton API");
            }
            if (playgroundKind === "project" && Object.keys(response.data).length === 0) {
                const playgroundResponse = await withRetry(() => client.get(buildPlaygroundPath(playgroundHash, playgroundKind)), 2, 400, (err) => !isPlaygroundKindMiss(err));
                if (isObject(playgroundResponse.data)) {
                    return { latestSubmission: playgroundResponse.data, playgroundKind };
                }
            }
            return { latestSubmission: response.data, playgroundKind };
        }
        catch (err) {
            if (isPlaygroundKindMiss(err)) {
                lastMiss = err;
                continue;
            }
            throw err;
        }
    }
    if (lastMiss)
        throw lastMiss;
    throw new Error(`Unable to fetch latest submission for playground '${playgroundHash}'.`);
}
async function submitPlaygroundCode(client, playgroundHash, payload, preferredKinds = []) {
    const candidates = buildPlaygroundKindCandidates(preferredKinds);
    let lastMiss;
    for (const playgroundKind of candidates) {
        try {
            await withRetry(() => client.patch(buildSubmitPath(playgroundHash, playgroundKind), payload), 2, 400, (err) => !isPlaygroundKindMiss(err));
            return playgroundKind;
        }
        catch (err) {
            if (isPlaygroundKindMiss(err)) {
                lastMiss = err;
                continue;
            }
            throw err;
        }
    }
    if (lastMiss)
        throw lastMiss;
    throw new Error(`Unable to submit to playground '${playgroundHash}'.`);
}
async function pollLatestSubmission(client, playgroundHash, preferredKind) {
    const maxAttempts = maybeNumber(process.env.NEWTON_SUBMIT_POLL_ATTEMPTS) ??
        DEFAULT_SUBMIT_POLL_ATTEMPTS;
    const intervalMs = maybeNumber(process.env.NEWTON_SUBMIT_POLL_INTERVAL_MS) ??
        DEFAULT_SUBMIT_POLL_INTERVAL_MS;
    let latest = {};
    let activeKind = preferredKind;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const fetched = await fetchLatestSubmissionRaw(client, playgroundHash, activeKind ? [activeKind] : []);
        latest = fetched.latestSubmission;
        activeKind = fetched.playgroundKind;
        if (!isPendingBuild(latest)) {
            return {
                latestSubmission: latest,
                playgroundKind: activeKind,
            };
        }
        await new Promise((res) => setTimeout(res, intervalMs));
    }
    return {
        latestSubmission: latest,
        playgroundKind: activeKind ?? "coding",
    };
}
function encodeSubmissionId(playgroundHash, latestSubmission, playgroundKind) {
    const submissionHash = firstString(latestSubmission.hash, latestSubmission.submission_hash, latestSubmission.id, latestSubmission.token) ?? "latest";
    const playgroundRef = playgroundKind === "coding"
        ? playgroundHash
        : `${playgroundKind}/${playgroundHash}`;
    return `${playgroundRef}:${submissionHash}`;
}
async function withRetry(fn, retries = 2, delayMs = 400, shouldRetry) {
    try {
        return await fn();
    }
    catch (err) {
        if (shouldRetry && !shouldRetry(err))
            throw err;
        if (retries <= 0)
            throw err;
        await new Promise((res) => setTimeout(res, delayMs));
        return withRetry(fn, retries - 1, delayMs * 2, shouldRetry);
    }
}
function normalizeError(err) {
    if (axios.isAxiosError(err)) {
        const axErr = err;
        if (axErr.response?.status === 401) {
            return new Error("Unauthorized: Newton session is invalid or expired. Run auth_login and retry.");
        }
        const status = axErr.response?.status;
        const message = axErr.response?.data && typeof axErr.response.data === "object"
            ? JSON.stringify(axErr.response.data)
            : axErr.message;
        return new Error(`Newton API error${status ? " (" + status + ")" : ""}: ${message}`);
    }
    return err instanceof Error ? err : new Error(String(err));
}
export async function fetchProblem(problemId, options) {
    try {
        const client = createClient(options?.auth);
        const resolved = await resolvePlayground(client, {
            problemId,
            courseHash: options?.courseHash,
            assignmentHash: options?.assignmentHash,
        });
        return normalizeProblemFromPlayground(resolved.playground, problemId);
    }
    catch (err) {
        throw normalizeError(err);
    }
}
export async function listAssignmentQuestions(courseHashInput, options) {
    try {
        const client = createClient(options?.auth);
        const courseHash = courseHashInput ?? getDefaultCourseHash();
        if (!courseHash) {
            throw new Error("Missing course hash. Pass courseHash or set NEWTON_COURSE_HASH.");
        }
        const assignments = await listAssignmentsRaw(client, courseHash);
        return assignments.flatMap((assignment) => normalizeAssignmentQuestions(assignment));
    }
    catch (err) {
        throw normalizeError(err);
    }
}
export async function submitSolution(problemId, language, code, options) {
    try {
        const client = createClient(options?.auth);
        const preferredPlaygroundKind = normalizePlaygroundKind(options?.playgroundType);
        const resolved = await resolvePlayground(client, {
            problemId,
            courseHash: options?.courseHash,
            assignmentHash: options?.assignmentHash,
            preferredPlaygroundKind,
        });
        const isCodingPlayground = resolved.playgroundKind === "coding";
        const languageId = resolveLanguageId(resolved.playground, language, {
            allowMissing: !isCodingPlayground,
        });
        const payload = {
            hash: resolved.playgroundHash,
            source_code: code,
            run_hidden_test: true,
            showSubmissionTab: true,
            is_force_save: true,
        };
        if (languageId !== undefined) {
            payload.language_id = languageId;
        }
        if (!isCodingPlayground) {
            payload.code = code;
            payload.sourceCode = code;
            const files = maybeJsonObject(code);
            if (files) {
                payload.files = files;
                payload.project_files = files;
            }
        }
        const lastSavedAt = firstString(resolved.playground.last_saved_at);
        if (lastSavedAt) {
            payload.last_saved_at = lastSavedAt;
        }
        const submitKind = await submitPlaygroundCode(client, resolved.playgroundHash, payload, uniquePlaygroundKinds([
            preferredPlaygroundKind,
            resolved.playgroundKind,
            ...extractPlaygroundKindHints(resolved.playground),
        ]));
        const polled = await pollLatestSubmission(client, resolved.playgroundHash, submitKind);
        return {
            submissionId: encodeSubmissionId(resolved.playgroundHash, polled.latestSubmission, polled.playgroundKind),
            playgroundHash: resolved.playgroundHash,
            raw: polled.latestSubmission,
        };
    }
    catch (err) {
        throw normalizeError(err);
    }
}
export async function getSubmissionStatus(submissionId, options) {
    try {
        const client = createClient(options?.auth);
        const { playgroundHash, playgroundKind } = parseSubmissionRef(submissionId);
        const latest = await fetchLatestSubmissionRaw(client, playgroundHash, playgroundKind ? [playgroundKind] : []);
        return normalizeSubmissionStatus(latest.latestSubmission);
    }
    catch (err) {
        throw normalizeError(err);
    }
}
export async function getCurrentUser(options) {
    try {
        const client = createClient(options?.auth);
        const response = await withRetry(() => client.get("/api/v1/user/me/"));
        if (!isObject(response.data)) {
            throw new Error("Unexpected user response from Newton API");
        }
        return response.data;
    }
    catch (err) {
        throw normalizeError(err);
    }
}
//# sourceMappingURL=newtonApi.js.map