import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { fetchProblem, getSubmissionStatus, listAssignmentQuestions, submitSolution, } from "./newtonApi.js";
const server = new McpServer({ name: "newton-submit-mcp", version: "1.0.0" });
server.registerTool("get_problem", {
    description: "Fetch a Newton coding problem. problemId can be playground hash, assignment-question hash, or course/assignment/question reference.",
    inputSchema: z.object({
        problemId: z.string(),
        courseHash: z.string().optional(),
        assignmentHash: z.string().optional(),
    }),
}, async ({ problemId, courseHash, assignmentHash }) => {
    try {
        return toolSuccess(await fetchProblem(problemId, { courseHash, assignmentHash }));
    }
    catch (err) {
        throw wrapError(err);
    }
});
server.registerTool("submit_solution", {
    description: "Submit code to Newton (runs hidden tests). problemId can be playground hash or assignment-question hash.",
    inputSchema: z.object({
        problemId: z.string(),
        language: z.string(),
        code: z.string(),
        courseHash: z.string().optional(),
        assignmentHash: z.string().optional(),
    }),
}, async ({ problemId, language, code, courseHash, assignmentHash }) => {
    try {
        return toolSuccess(await submitSolution(problemId, language, code, {
            courseHash,
            assignmentHash,
        }));
    }
    catch (err) {
        throw wrapError(err);
    }
});
server.registerTool("check_submission", {
    description: "Check submission status by submission id",
    inputSchema: z.object({
        submissionId: z.string(),
    }),
}, async ({ submissionId }) => {
    try {
        return toolSuccess(await getSubmissionStatus(submissionId));
    }
    catch (err) {
        throw wrapError(err);
    }
});
server.registerTool("list_assignment_questions", {
    description: "List assignment question hashes for a course (useful for Semester 2 bulk solving flows).",
    inputSchema: z.object({
        courseHash: z.string().optional(),
    }),
}, async ({ courseHash }) => {
    try {
        return toolSuccess(await listAssignmentQuestions(courseHash));
    }
    catch (err) {
        throw wrapError(err);
    }
});
function wrapError(err) {
    if (err instanceof Error)
        return err;
    return new Error(String(err));
}
function toolSuccess(data) {
    return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
}
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("newton-submit-mcp running on stdio");
}
main().catch((err) => {
    console.error("Failed to start MCP server", err);
    process.exit(1);
});
//# sourceMappingURL=server.js.map