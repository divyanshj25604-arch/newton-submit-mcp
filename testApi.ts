import { fetchProblem } from './src/newtonApi.js';

async function main() {
  const problemId = process.argv[2] || 'compute-power';
  try {
    const problem = await fetchProblem(problemId);
    console.log(JSON.stringify(problem, null, 2));
  } catch (err) {
    console.error(err);
  }
}

main();
