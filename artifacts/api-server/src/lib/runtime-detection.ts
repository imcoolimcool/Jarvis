import { execSync, spawnSync } from "node:child_process";

export interface RuntimeInfo {
  language: string;
  version: string;
  binary: string;
  available: boolean;
  manager?: string;
}

export interface FrameworkInfo {
  name: string;
  version: string | null;
  buildCommand?: string;
  runCommand?: string;
  package?: string;
  available: boolean;
}

/**
 * Detect available runtimes in the workspace.
 * Supports: Node.js, Python, Go, Rust, Ruby, PHP, Java, .NET, Dart, Swift, Kotlin, Elixir, Clojure
 */
export function detectRuntimes(): Record<string, RuntimeInfo> {
  const runtimes: Record<string, RuntimeInfo> = {};

  const checkRuntime = (
    name: string,
    label: string,
    versionCmd: string,
    managerCmd?: string,
  ): void => {
    try {
      const version = execSync(versionCmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
      const manager = managerCmd
        ? (() => {
            try {
              const mgr = execSync(managerCmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
              return mgr.split("\n")[0];
            } catch {
              return undefined;
            }
          })()
        : undefined;
      runtimes[name] = {
        language: label,
        version,
        binary: name,
        available: true,
        manager,
      };
    } catch {
      runtimes[name] = {
        language: label,
        version: "not installed",
        binary: name,
        available: false,
      };
    }
  };

  // JavaScript/TypeScript runtimes
  checkRuntime("node", "Node.js", "node --version", "npm --version");
  checkRuntime("deno", "Deno", "deno --version");
  checkRuntime("bun", "Bun", "bun --version");

  // Python
  checkRuntime("python", "Python", "python3 --version", "pip3 --version");

  // Backend frameworks
  checkRuntime("go", "Go", "go version");
  checkRuntime("rust", "Rust", "rustc --version", "cargo --version");
  checkRuntime("ruby", "Ruby", "ruby --version", "gem --version");
  checkRuntime("php", "PHP", "php --version");
  checkRuntime("java", "Java", "java -version");
  checkRuntime("kotlin", "Kotlin", "kotlin -version");

  // .NET
  checkRuntime("dotnet", ".NET", "dotnet --version");

  // JVM Languages
  checkRuntime("scala", "Scala", "scala -version");
  checkRuntime("clojure", "Clojure", "clojure -e \"(println (clojure-version))\"");

  // Functional Languages
  checkRuntime("haskell", "Haskell", "ghc --version");
  checkRuntime("elixir", "Elixir", "elixir --version");
  checkRuntime("erlang", "Erlang", "erl -eval 'erlang:halt()'");

  // C/C++
  checkRuntime("gcc", "C/C++ (GCC)", "gcc --version");
  checkRuntime("clang", "C/C++ (Clang)", "clang --version");

  // Other languages
  checkRuntime("swift", "Swift", "swift --version");
  checkRuntime("lua", "Lua", "lua -v");
  checkRuntime("perl", "Perl", "perl -v");
  checkRuntime("r", "R", "Rscript --version");

  return runtimes;
}

/**
 * Detect language from file extension.
 */
export function detectLanguageFromFile(filePath: string): string | null {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    // JavaScript/TypeScript ecosystem
    js: "javascript",
    ts: "typescript",
    jsx: "javascript",
    tsx: "typescript",
    mjs: "javascript",
    cjs: "javascript",
    
    // Python
    py: "python",
    pyw: "python",
    
    // Go
    go: "go",
    
    // Rust
    rs: "rust",
    
    // Ruby
    rb: "ruby",
    erb: "ruby",
    
    // PHP
    php: "php",
    phtml: "php",
    
    // Java/JVM
    java: "java",
    kt: "kotlin",
    kts: "kotlin",
    scala: "scala",
    clj: "clojure",
    cljs: "clojure",
    
    // C/C#/C++
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    hpp: "cpp",
    cs: "csharp",
    
    // .NET
    vb: "vbnet",
    fsx: "fsharp",
    fs: "fsharp",
    
    // Functional
    hs: "haskell",
    lhs: "haskell",
    ex: "elixir",
    exs: "elixir",
    erl: "erlang",
    
    // Swift/Dart
    swift: "swift",
    dart: "dart",
    
    // Markup & Styling
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    sass: "scss",
    less: "less",
    
    // Data/Config
    json: "json",
    json5: "json5",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    ini: "ini",
    env: "env",
    
    // Shell
    sh: "bash",
    bash: "bash",
    zsh: "zsh",
    fish: "fish",
    
    // Other
    md: "markdown",
    tex: "latex",
    lua: "lua",
    pl: "perl",
    r: "r",
  };
  return ext ? languageMap[ext] || null : null;
}

/**
 * Detect frameworks from workspace files and config files.
 */
export async function detectFrameworks(fileNames: string[]): Promise<Record<string, FrameworkInfo>> {
  const frameworks: Record<string, FrameworkInfo> = {};
  
  const hasFile = (name: string) => fileNames.some(f => f.toLowerCase().includes(name.toLowerCase()));
  const hasPackage = (pkg: string) => fileNames.some(f => f === "package.json" || f === "requirements.txt" || f === "Cargo.toml" || f === "go.mod");

  // Frontend frameworks (JavaScript/TypeScript)
  if (hasFile("vite.config")) {
    frameworks.vite = { name: "Vite", version: null, available: true, buildCommand: "vite build", runCommand: "vite" };
  }
  if (hasFile("next.config") || hasFile("pages/") || hasFile("app/")) {
    frameworks.nextjs = { name: "Next.js", version: null, available: true, buildCommand: "next build", runCommand: "next dev" };
  }
  if (hasFile("nuxt.config")) {
    frameworks.nuxt = { name: "Nuxt", version: null, available: true, buildCommand: "nuxt build", runCommand: "nuxt dev" };
  }
  if (hasFile("svelte.config")) {
    frameworks.svelte = { name: "Svelte/SvelteKit", version: null, available: true, buildCommand: "vite build", runCommand: "vite dev" };
  }
  if (hasFile("vue.config") || hasFile("src/App.vue")) {
    frameworks.vue = { name: "Vue.js", version: null, available: true, buildCommand: "vite build", runCommand: "vite dev" };
  }
  if (hasFile("angular.json")) {
    frameworks.angular = { name: "Angular", version: null, available: true, buildCommand: "ng build", runCommand: "ng serve" };
  }
  if (hasFile("remix.config")) {
    frameworks.remix = { name: "Remix", version: null, available: true, buildCommand: "remix build", runCommand: "remix dev" };
  }
  if (hasFile("astro.config")) {
    frameworks.astro = { name: "Astro", version: null, available: true, buildCommand: "astro build", runCommand: "astro dev" };
  }
  if (hasFile("solid.config") || hasFile("src/index.tsx")) {
    frameworks.solid = { name: "SolidJS", version: null, available: true, buildCommand: "solid build", runCommand: "solid dev" };
  }

  // Backend frameworks (Node.js)
  if (hasFile("express")) frameworks.express = { name: "Express.js", version: null, available: true, runCommand: "node server.js" };
  if (hasFile("fastify")) frameworks.fastify = { name: "Fastify", version: null, available: true, runCommand: "node server.js" };
  if (hasFile("hono")) frameworks.hono = { name: "Hono", version: null, available: true, buildCommand: "npm run build", runCommand: "npm start" };

  // Python frameworks
  if (hasFile("django")) {
    frameworks.django = { name: "Django", version: null, available: true, buildCommand: "python manage.py migrate", runCommand: "python manage.py runserver" };
  }
  if (hasFile("fastapi") || hasFile("main.py") && hasFile("requirements.txt")) {
    frameworks.fastapi = { name: "FastAPI", version: null, available: true, runCommand: "uvicorn main:app --reload" };
  }
  if (hasFile("flask") || hasFile("app.py")) {
    frameworks.flask = { name: "Flask", version: null, available: true, runCommand: "flask run" };
  }
  if (hasFile("streamlit")) {
    frameworks.streamlit = { name: "Streamlit", version: null, available: true, runCommand: "streamlit run app.py" };
  }
  if (hasFile("gradio")) {
    frameworks.gradio = { name: "Gradio", version: null, available: true, runCommand: "python app.py" };
  }

  // Go frameworks
  if (hasFile("go.mod")) {
    frameworks.go_generic = { name: "Go Module", version: null, available: true, buildCommand: "go build", runCommand: "go run main.go" };
  }

  // Rust frameworks
  if (hasFile("Cargo.toml")) {
    frameworks.rust_generic = { name: "Rust Project", version: null, available: true, buildCommand: "cargo build --release", runCommand: "cargo run" };
  }

  // Mobile frameworks
  if (hasFile("react-native")) frameworks.react_native = { name: "React Native", version: null, available: true };
  if (hasFile("expo")) frameworks.expo = { name: "Expo", version: null, available: true, runCommand: "expo start" };
  if (hasFile("flutter")) frameworks.flutter = { name: "Flutter", version: null, available: true, buildCommand: "flutter build", runCommand: "flutter run" };

  // Desktop frameworks
  if (hasFile("electron")) {
    frameworks.electron = { name: "Electron", version: null, available: true, buildCommand: "npm run build", runCommand: "npm start" };
  }

  // 3D/Graphics
  if (hasFile("three") || hasFile("babylon")) {
    frameworks.threejs = { name: "Three.js/Babylon.js", version: null, available: true };
  }
  if (hasFile("p5") || hasFile("processing")) {
    frameworks.p5js = { name: "p5.js/Processing", version: null, available: true };
  }

  // Testing frameworks
  if (hasFile("playwright.config")) {
    frameworks.playwright = { name: "Playwright", version: null, available: true, runCommand: "playwright test" };
  }
  if (hasFile("puppeteer")) {
    frameworks.puppeteer = { name: "Puppeteer", version: null, available: true };
  }

  // Static site generators
  if (hasFile("hugo.toml") || hasFile("config.toml")) {
    frameworks.hugo = { name: "Hugo", version: null, available: true, buildCommand: "hugo", runCommand: "hugo server" };
  }
  if (hasFile("_config.yml") || hasFile("_config.yaml")) {
    frameworks.jekyll = { name: "Jekyll", version: null, available: true, buildCommand: "jekyll build", runCommand: "jekyll serve" };
  }
  if (hasFile("mkdocs.yml")) {
    frameworks.mkdocs = { name: "MkDocs", version: null, available: true, buildCommand: "mkdocs build", runCommand: "mkdocs serve" };
  }

  // Styling
  if (hasFile("tailwind.config")) {
    frameworks.tailwind = { name: "Tailwind CSS", version: null, available: true };
  }

  // Backend (JVM)
  if (hasFile("pom.xml")) {
    frameworks.maven = { name: "Spring Boot/Maven", version: null, available: true, buildCommand: "mvn clean package", runCommand: "mvn spring-boot:run" };
  }

  // Ruby frameworks
  if (hasFile("rails")) {
    frameworks.rails = { name: "Ruby on Rails", version: null, available: true, buildCommand: "rails assets:precompile", runCommand: "rails server" };
  }

  // PHP frameworks
  if (hasFile("laravel")) {
    frameworks.laravel = { name: "Laravel", version: null, available: true, runCommand: "php artisan serve" };
  }

  // Elixir
  if (hasFile("phoenix")) {
    frameworks.phoenix = { name: "Phoenix", version: null, available: true, buildCommand: "mix ecto.create && mix ecto.migrate", runCommand: "mix phx.server" };
  }

  return frameworks;
}

/**
 * Suggest a preview/run command for a workspace based on detected files.
 */
export function suggestPreviewCommand(fileNames: string[]): string {
  const hasFile = (name: string) => fileNames.some(f => f.toLowerCase().includes(name.toLowerCase()));

  // JavaScript/TypeScript projects
  if (hasFile("package.json")) {
    // Check for specific scripts first
    if (hasFile("next.config")) return "npm run dev";
    if (hasFile("vite.config")) return "npm run dev";
    if (hasFile("nuxt.config")) return "npm run dev";
    if (hasFile("astro.config")) return "npm run dev";
    if (hasFile("remix.config")) return "npm run dev";
    if (hasFile("angular.json")) return "ng serve";
    if (hasFile("svelte.config")) return "npm run dev";
    if (hasFile("expo")) return "expo start";
    return "npm run dev";
  }

  // Python projects
  if (hasFile("requirements.txt") || hasFile("pyproject.toml") || hasFile("setup.py")) {
    if (hasFile("django")) return "python manage.py runserver";
    if (hasFile("fastapi") || hasFile("uvicorn")) return "uvicorn main:app --reload";
    if (hasFile("streamlit")) return "streamlit run app.py";
    if (hasFile("gradio")) return "python app.py";
    if (hasFile("flask") || hasFile("app.py")) return "python app.py";
    return "python3 -m http.server 8000";
  }

  // Go projects
  if (hasFile("go.mod") || hasFile("go.sum")) {
    return "go run main.go";
  }

  // Rust projects
  if (hasFile("Cargo.toml")) {
    return "cargo run";
  }

  // Ruby projects
  if (hasFile("Gemfile")) {
    if (hasFile("rails")) return "rails server";
    if (hasFile("config.ru")) return "bundle exec rackup";
    return "ruby app.rb";
  }

  // PHP projects
  if (hasFile("composer.json")) {
    if (hasFile("laravel")) return "php artisan serve";
    return "php -S localhost:8000";
  }

  // Elixir projects
  if (hasFile("mix.exs")) {
    if (hasFile("phoenix")) return "mix phx.server";
    return "mix run";
  }

  // Java projects
  if (hasFile("pom.xml")) {
    return "mvn spring-boot:run";
  }
  if (hasFile("build.gradle")) {
    return "gradle bootRun";
  }

  // Static site generators
  if (hasFile("hugo.toml") || hasFile("config.toml")) {
    return "hugo server";
  }
  if (hasFile("_config.yml")) {
    return "jekyll serve";
  }
  if (hasFile("mkdocs.yml")) {
    return "mkdocs serve";
  }

  // Dockerized projects
  if (hasFile("Dockerfile")) {
    return "docker build -t app . && docker run -p 8000:8000 app";
  }

  // Static HTML/CSS/JS
  if (hasFile("index.html")) {
    return "python3 -m http.server 8000";
  }

  // Default: HTTP server
  return "python3 -m http.server 8000";
}
