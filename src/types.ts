export interface ProblemExample {
  input: string;
  output: string;
  explanation?: string;
}

export interface Problem {
  id: string;
  title: string;
  description: string;
  constraints?: string;
  examples?: ProblemExample[];
}

export interface AssignmentQuestionRef {
  assignmentHash: string;
  assignmentTitle?: string;
  questionHash: string;
  questionTitle?: string;
  questionType?: string;
}

export type SubmissionStatusValue =
  | "Accepted"
  | "Wrong Answer"
  | "TLE"
  | "Runtime Error"
  | "Compilation Error"
  | "Pending";

export interface SubmissionResponse {
  submissionId: string;
  playgroundHash?: string;
  raw?: unknown;
}

export interface SubmissionStatus {
  status: SubmissionStatusValue;
  runtime?: number;
  memory?: number;
  raw?: unknown;
}
