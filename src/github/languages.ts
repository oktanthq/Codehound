import { basename } from "node:path";

export type FileKind = "source" | "test" | "config" | "docs" | "data" | "other";

export type DetectedFile = {
  language: string | undefined;
  kind: FileKind;
};

export type LanguageStat = {
  language: string;
  fileCount: number;
  byteSize: number;
};

export type LanguageSummary = {
  languages: LanguageStat[];
  primaryLanguage: string | undefined;
};

const EXTENSION_LANGUAGE: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".mts": "TypeScript",
  ".cts": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
  ".pyi": "Python",
  ".pyw": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".kts": "Kotlin",
  ".swift": "Swift",
  ".rb": "Ruby",
  ".php": "PHP",
  ".cs": "C#",
  ".c": "C",
  ".h": "C",
  ".cpp": "C++",
  ".cc": "C++",
  ".cxx": "C++",
  ".hpp": "C++",
  ".hh": "C++",
  ".m": "Objective-C",
  ".mm": "Objective-C++",
  ".scala": "Scala",
  ".sc": "Scala",
  ".clj": "Clojure",
  ".cljs": "Clojure",
  ".ex": "Elixir",
  ".exs": "Elixir",
  ".erl": "Erlang",
  ".hrl": "Erlang",
  ".hs": "Haskell",
  ".lua": "Lua",
  ".r": "R",
  ".jl": "Julia",
  ".dart": "Dart",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".scss": "SCSS",
  ".sass": "Sass",
  ".less": "Less",
  ".css": "CSS",
  ".html": "HTML",
  ".htm": "HTML",
  ".xml": "XML",
  ".sh": "Shell",
  ".bash": "Shell",
  ".zsh": "Shell",
  ".ksh": "Shell",
  ".ps1": "PowerShell",
  ".psm1": "PowerShell",
  ".sql": "SQL",
  ".graphql": "GraphQL",
  ".gql": "GraphQL",
  ".proto": "Protocol Buffers",
  ".tf": "HCL",
  ".hcl": "HCL",
  ".md": "Markdown",
  ".mdx": "Markdown",
  ".rst": "reStructuredText",
  ".json": "JSON",
  ".yml": "YAML",
  ".yaml": "YAML",
  ".toml": "TOML",
  ".ini": "INI",
  ".cfg": "INI",
  ".conf": "INI",
  ".properties": "INI",
  ".csv": "CSV",
  ".tsv": "CSV",
  ".txt": "Text",
  ".gradle": "Gradle",
  ".cmake": "CMake",
  ".pl": "Perl",
  ".pm": "Perl",
  ".awk": "Awk",
};

const FILENAME_LANGUAGE: Record<string, string> = {
  dockerfile: "Dockerfile",
  containerfile: "Dockerfile",
  makefile: "Makefile",
  gnumakefile: "Makefile",
  "cmakelists.txt": "CMake",
  "go.mod": "Go",
  "go.sum": "Go",
  gemfile: "Ruby",
  rakefile: "Ruby",
  podfile: "Ruby",
  jenkinsfile: "Groovy",
  procfile: "Procfile",
  ".gitignore": "Ignore List",
  ".gitattributes": "Git Config",
  ".gitmodules": "Git Config",
  ".editorconfig": "EditorConfig",
  ".nvmrc": "Text",
  ".env": "INI",
  ".env.example": "INI",
};

const CONFIG_FILENAMES = new Set([
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "npm-shrinkwrap.json",
  "tsconfig.json",
  "jsconfig.json",
  "cargo.toml",
  "cargo.lock",
  "go.mod",
  "go.sum",
  "pyproject.toml",
  "poetry.lock",
  "requirements.txt",
  "pipfile",
  "pipfile.lock",
  "gemfile",
  "gemfile.lock",
  "composer.json",
  "composer.lock",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "makefile",
  "gnumakefile",
  "dockerfile",
  "containerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "cmakelists.txt",
  ".gitignore",
  ".gitattributes",
  ".gitmodules",
  ".editorconfig",
  ".prettierrc",
  ".prettierrc.json",
  ".eslintrc",
  ".eslintrc.json",
  ".eslintrc.cjs",
  ".nvmrc",
  ".env",
  ".env.example",
  "procfile",
  "eslint.config.js",
  "eslint.config.ts",
  "vitest.config.ts",
  "vite.config.ts",
]);

const CONFIG_EXTENSIONS = new Set([
  ".json",
  ".yml",
  ".yaml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".lock",
  ".properties",
  ".gradle",
  ".cmake",
  ".editorconfig",
]);

const DOCS_FILENAMES = new Set([
  "readme",
  "readme.md",
  "readme.rst",
  "readme.txt",
  "changelog",
  "changelog.md",
  "changes",
  "license",
  "license.md",
  "copying",
  "authors",
  "contributors",
  "code_of_conduct.md",
  "security.md",
  "contributing.md",
]);

const DOCS_EXTENSIONS = new Set([".md", ".mdx", ".rst", ".txt", ".adoc"]);

const DATA_EXTENSIONS = new Set([".csv", ".tsv"]);

const PRIMARY_LANGUAGES = new Set([
  "TypeScript",
  "JavaScript",
  "Python",
  "Go",
  "Rust",
  "Java",
  "Kotlin",
  "Swift",
  "Ruby",
  "PHP",
  "C#",
  "C",
  "C++",
  "Objective-C",
  "Objective-C++",
  "Scala",
  "Clojure",
  "Elixir",
  "Erlang",
  "Haskell",
  "Lua",
  "R",
  "Julia",
  "Dart",
  "Vue",
  "Svelte",
  "Shell",
  "PowerShell",
  "SQL",
  "GraphQL",
  "Protocol Buffers",
  "HCL",
  "Dockerfile",
  "Makefile",
  "CMake",
  "Groovy",
  "Perl",
  "Awk",
  "Gradle",
]);

const SHEBANG_LANGUAGE: Record<string, string> = {
  python: "Python",
  python2: "Python",
  python3: "Python",
  node: "JavaScript",
  nodejs: "JavaScript",
  ruby: "Ruby",
  bash: "Shell",
  sh: "Shell",
  zsh: "Shell",
  ksh: "Shell",
  dash: "Shell",
  perl: "Perl",
  php: "PHP",
  lua: "Lua",
  awk: "Awk",
  gawk: "Awk",
  "ts-node": "TypeScript",
};

const TEST_PATH = /(^|\/)(test|tests|__tests__|spec|specs)(\/|$)/;
const TEST_FILE = /\.(tests|test|spec)\.[^.]+$/;

function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  if (index <= 0) {
    return "";
  }
  return name.slice(index).toLowerCase();
}

function languageFromShebang(prefix: string | undefined): string | undefined {
  if (prefix === undefined) {
    return undefined;
  }
  const text = prefix.charCodeAt(0) === 0xfeff ? prefix.slice(1) : prefix;
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  if (!firstLine.startsWith("#!")) {
    return undefined;
  }
  const tokens = firstLine.slice(2).trim().split(/\s+/);
  const executable = tokens[0] ?? "";
  const interpreter = basename(executable).toLowerCase();
  if (interpreter === "env") {
    const nested = (tokens[1] ?? "").toLowerCase();
    return SHEBANG_LANGUAGE[nested];
  }
  return SHEBANG_LANGUAGE[interpreter];
}

function languageFromPath(relativePath: string): string | undefined {
  const name = basename(relativePath).toLowerCase();
  const byName = FILENAME_LANGUAGE[name];
  if (byName !== undefined) {
    return byName;
  }
  const extension = extensionOf(name);
  if (extension.length === 0) {
    return undefined;
  }
  return EXTENSION_LANGUAGE[extension];
}

function kindFromPath(relativePath: string, language: string | undefined): FileKind {
  const normalized = relativePath.replaceAll("\\", "/");
  const name = basename(normalized).toLowerCase();
  const extension = extensionOf(name);
  if (TEST_PATH.test(normalized.toLowerCase()) || TEST_FILE.test(name)) {
    return "test";
  }
  if (DOCS_FILENAMES.has(name) || name.startsWith("readme.") || DOCS_EXTENSIONS.has(extension)) {
    return "docs";
  }
  if (CONFIG_FILENAMES.has(name) || CONFIG_EXTENSIONS.has(extension)) {
    return "config";
  }
  if (DATA_EXTENSIONS.has(extension)) {
    return "data";
  }
  if (language !== undefined && PRIMARY_LANGUAGES.has(language)) {
    return "source";
  }
  if (language !== undefined) {
    return "other";
  }
  return "other";
}

export function detectFile(relativePath: string, prefix: string | undefined): DetectedFile {
  let language = languageFromPath(relativePath);
  if (language === undefined) {
    language = languageFromShebang(prefix);
  }
  return {
    language,
    kind: kindFromPath(relativePath, language),
  };
}

export function summarizeLanguages(
  files: readonly { size: number; language: string | undefined; kind: FileKind }[],
): LanguageSummary {
  const counts = new Map<string, LanguageStat>();
  for (const file of files) {
    if (file.language === undefined) {
      continue;
    }
    const existing = counts.get(file.language);
    if (existing === undefined) {
      counts.set(file.language, {
        language: file.language,
        fileCount: 1,
        byteSize: file.size,
      });
    } else {
      existing.fileCount += 1;
      existing.byteSize += file.size;
    }
  }
  const languages = [...counts.values()].sort((a, b) => {
    if (b.byteSize !== a.byteSize) {
      return b.byteSize - a.byteSize;
    }
    if (b.fileCount !== a.fileCount) {
      return b.fileCount - a.fileCount;
    }
    return a.language.localeCompare(b.language);
  });

  const codeStats = new Map<string, LanguageStat>();
  for (const file of files) {
    if (file.language === undefined || (file.kind !== "source" && file.kind !== "test")) {
      continue;
    }
    if (!PRIMARY_LANGUAGES.has(file.language)) {
      continue;
    }
    const existing = codeStats.get(file.language);
    if (existing === undefined) {
      codeStats.set(file.language, {
        language: file.language,
        fileCount: 1,
        byteSize: file.size,
      });
    } else {
      existing.fileCount += 1;
      existing.byteSize += file.size;
    }
  }
  const codeLanguages = [...codeStats.values()].sort((a, b) => {
    if (b.byteSize !== a.byteSize) {
      return b.byteSize - a.byteSize;
    }
    return a.language.localeCompare(b.language);
  });
  const primaryLanguage = codeLanguages[0]?.language ?? languages[0]?.language;

  return { languages, primaryLanguage };
}

export function fileInventory(
  files: readonly { size: number; language: string | undefined; kind: FileKind }[],
): {
  fileCount: number;
  byteSize: number;
  languages: LanguageStat[];
  primaryLanguage: string | undefined;
} {
  const summary = summarizeLanguages(files);
  return {
    fileCount: files.length,
    byteSize: files.reduce((sum, file) => sum + file.size, 0),
    languages: summary.languages,
    primaryLanguage: summary.primaryLanguage,
  };
}
