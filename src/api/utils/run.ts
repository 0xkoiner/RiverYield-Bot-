import { spawn } from "child_process";

export function runTsScript(scriptPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Use npx ts-node to execute TS files without prebuild
    const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", [
      "ts-node",
      scriptPath
    ], { stdio: "inherit" });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptPath} exited with code ${code}`));
    });
  });
}