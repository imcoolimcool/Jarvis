import { execSync, spawnSync } from "node:child_process";

export interface RuntimeInfo {
  language: string;
  version: string;
  binary: string;
  available: boolean;
  manager?: string;
}

/**
 * Detect available runtimes in the workspace.
 * Supports: Node.js, Python, Go, Rust, Ruby, PHP, Java
 */
export function detectRuntimes(): Record<string, RuntimeInfo> {
  const runtimes: Record<string, RuntimeInfo> = {};

  // Node.js / npm
  try {
    const nodeVersion = execSync("node --version", { encoding: "utf-8" }).trim();
    const npmVersion = execSync("npm --version", { encoding: "utf-8" }).trim();
    runtimes.nodejs = {
      language: "JavaScript/TypeScript",
      version: nodeVersion,
      binary: "node",
      available: true,
      manager: `npm (${npmVersion})`,
    };
  } catch {
    runtimes.nodejs = {
      language: "JavaScript/TypeScript",
      version: "not installed",
      binary: "node",
      available: false,
    };
  }

  // Python
  try {
    const pythonVersion = execSync("python3 --version", { encoding: "utf-8" }).trim();
    const pipVersion = execSync("pip3 --version", { encoding: "utf-8" }).trim();
    runtimes.python = {
      language: "Python",
      version: pythonVersion,
      binary: "python3",
      available: true,
      manager: `pip3 (${pipVersion.split(" ")[1]})`,
    };
  } catch {
    runtimes.python = {
      language: "Python",
      version: "not installed",
      binary: "python3",
      available: false,
    };
  }

  // Go
  try {
    const goVersion = execSync("go version", { encoding: "utf-8" }).trim();
    runtimes.go = {
      language: "Go",
      version: goVersion,
      binary: "go",
      available: true,
    };
  } catch {
    runtimes.go = {
      language: "Go",
      version: "not installed",
      binary: "go",
      available: false,
    };
  }

  // Rust
  try {
    const rustVersion = execSync("rustc --version", { encoding: "utf-8" }).trim();
    const cargoVersion = execSync("cargo --version", { encoding: "utf-8" }).trim();
    runtimes.rust = {
      language: "Rust",
      version: rustVersion,
      binary: "rustc",
      available: true,
      manager: `cargo (${cargoVersion.split(" ")[1]})`,
    };
  } catch {
    runtimes.rust = {
      language: "Rust",
      version: "not installed",
      binary: "rustc",
      available: false,
    };
  }

  // Ruby
  try {
    const rubyVersion = execSync("ruby --version", { encoding: "utf-8" }).trim();
    const gemVersion = execSync("gem --version", { encoding: "utf-8" }).trim();
    runtimes.ruby = {
      language: "Ruby",
      version: rubyVersion,
      binary: "ruby",
      available: true,
      manager: `gem (${gemVersion})`,
    };
  } catch {
    runtimes.ruby = {
      language: "Ruby",
      version: "not installed",
      binary: "ruby",
      available: false,
    };
  }

  // PHP
  try {
    const phpVersion = execSync("php --version", { encoding: "utf-8" }).split("\n")[0];
    runtimes.php = {
      language: "PHP",
      version: phpVersion,
      binary: "php",
      available: true,
    };
  } catch {
    runtimes.php = {
      language: "PHP",
      version: "not installed",
      binary: "php",
      available: false,
    };
  }

  // Java
  try {
    const javaVersion = execSync("java -version", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] })
      .split("\n")[0];
    runtimes.java = {
      language: "Java",
      version: javaVersion,
      binary: "java",
      available: true,
    };
  } catch {
    runtimes.java = {
      language: "Java",
      version: "not installed",
      binary: "java",
      available: false,
    };
  }

  return runtimes;
}

/**
 * Detect language from file extension.
 */
export function detectLanguageFromFile(filePath: string): string | null {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    jsx: "javascript",
    tsx: "typescript",
    py: "python",
    go: "go",
    rs: "rust",
    rb: "ruby",
    php: "php",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    sh: "bash",
    bash: "bash",
    zsh: "zsh",
    html: "html",
    css: "css",
    scss: "scss",
    json: "json",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    md: "markdown",
  };
  return ext ? languageMap[ext] || null : null;
}

/**
 * Suggest a preview/run command for a workspace based on detected files.
 */
export function suggestPreviewCommand(fileNames: string[]): string {
  // If package.json exists with "dev" script, use that
  if (fileNames.includes("package.json")) {
    return "npm run dev";
  }

  // If index.html, use http.server
  if (fileNames.includes("index.html")) {
    return "python3 -m http.server ${PORT}";
  }

  // If main.py, use python
  if (fileNames.includes("main.py") || fileNames.includes("app.py")) {
    return "python3 app.py";
  }

  // If main.go, use go run
  if (fileNames.includes("main.go")) {
    return "go run main.go";
  }

  // If main.rs, use cargo
  if (fileNames.includes("Cargo.toml")) {
    return "cargo run";
  }

  // Default: HTTP server
  return "python3 -m http.server ${PORT}";
}
