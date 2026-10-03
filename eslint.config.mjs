import obsidian from "eslint-plugin-obsidianmd";

export default [
  ...obsidian.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: { "obsidianmd/ui/sentence-case": ["warn", { enforceCamelCaseLower: true, brands: ["Simple Link", "GitHub", "Gitee", "Obsidian", "Git", "Windows", "macOS", "Android", "iOS", "Linux", "Markdown", "README"], allowAutoFix: true }] },
    languageOptions: { globals: { process: "readonly", Buffer: "readonly", NodeJS: "readonly" }, parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
  },
];
