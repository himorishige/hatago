#!/usr/bin/env node
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/index.ts
import { Command as Command7 } from "commander";
import { readFileSync as readFileSync2 } from "fs";
import { fileURLToPath as fileURLToPath3 } from "url";
import { dirname as dirname4, join as join5 } from "path";

// src/utils/update-checker.ts
import updateNotifier from "update-notifier";
import { yellow, cyan } from "colorette";
function checkForUpdates(packageName, currentVersion) {
  try {
    const notifier = updateNotifier({
      pkg: { name: packageName, version: currentVersion },
      updateCheckInterval: 1e3 * 60 * 60 * 24,
      // 24 hours
      shouldNotifyInNpmScript: false
    });
    if (notifier.update) {
      const { latest, current } = notifier.update;
      console.log(`
${yellow("\u{1F4E6} Update available!")} ${current} \u2192 ${cyan(latest)}
Run ${cyan("npm install -g " + packageName)} to update
      `);
    }
  } catch {
  }
}

// src/utils/error-handler.ts
import { red, yellow as yellow2 } from "colorette";
import { ConfigValidationError } from "@hatago/config";
var CLIError = class extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
    this.name = "CLIError";
  }
};
function formatError(error) {
  if (error instanceof ConfigValidationError) {
    const lines = [
      red("\u274C Configuration validation failed:"),
      ""
    ];
    for (const issue of error.zodError.issues) {
      const path = issue.path.join(".");
      lines.push(`${red("  \u2022")} ${path}: ${issue.message}`);
    }
    return lines.join("\\n");
  }
  if (error instanceof CLIError) {
    return `${red("\u274C")} ${error.message}`;
  }
  return `${red("\u274C Unexpected error:")} ${error.message}`;
}
function handleWarning(warning) {
  if (process.env.HATAGO_VERBOSE === "true") {
    console.warn(`${yellow2("\u26A0\uFE0F  Warning:")} ${warning.message}`);
  }
}
function handleUncaughtException(error) {
  console.error("\\n" + formatError(error));
  if (process.env.HATAGO_VERBOSE === "true" && error.stack) {
    console.error("\\nStack trace:");
    console.error(error.stack);
  }
  console.error("\\nThis is likely a bug. Please report it at: https://github.com/himorishige/hatago/issues");
  process.exit(1);
}
function handleUnhandledRejection(reason) {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  handleUncaughtException(error);
}
function setupErrorHandling() {
  process.on("warning", handleWarning);
  process.on("uncaughtException", handleUncaughtException);
  process.on("unhandledRejection", handleUnhandledRejection);
  process.on("SIGINT", () => {
    console.log("\\n\u{1F44B} Goodbye!");
    process.exit(0);
  });
}

// src/commands/config.ts
import { Command } from "commander";
import { writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { green, red as red2, yellow as yellow3, cyan as cyan2 } from "colorette";
import {
  loadConfig,
  generateConfigTemplate,
  diagnoseConfig,
  formatDiagnostics,
  generateConfigFixes,
  ConfigValidationError as ConfigValidationError2
} from "@hatago/config";
function outputResult(data, message) {
  if (process.env.HATAGO_JSON_OUTPUT === "true") {
    console.log(JSON.stringify(data, null, 2));
  } else if (message) {
    console.log(message);
  }
}
async function handleValidate(options) {
  try {
    const result = await loadConfig();
    const report = diagnoseConfig(result.config);
    if (process.env.HATAGO_JSON_OUTPUT === "true") {
      outputResult({
        valid: !report.hasErrors,
        issues: report.issues,
        configPath: result.filepath
      });
      return;
    }
    if (result.filepath) {
      console.log(`\u{1F4CB} Checking configuration: ${cyan2(result.filepath)}`);
    } else {
      console.log(`\u{1F4CB} Checking default configuration (no config file found)`);
    }
    console.log(formatDiagnostics(report));
    if (report.hasErrors) {
      if (options.fix && report.canAutoFix) {
        console.log(`\\n\u{1F527} Applying automatic fixes...`);
        const fixedConfig = generateConfigFixes(result.config);
        const fixedReport = diagnoseConfig(fixedConfig);
        if (!fixedReport.hasErrors) {
          const configContent = JSON.stringify(fixedConfig, null, 2);
          if (result.filepath) {
            writeFileSync(result.filepath, configContent);
            console.log(`${green("\u2705")} Configuration fixed and saved to ${result.filepath}`);
          } else {
            const defaultPath = resolve("hatago.config.json");
            writeFileSync(defaultPath, configContent);
            console.log(`${green("\u2705")} Configuration saved to ${defaultPath}`);
          }
        } else {
          console.log(`${yellow3("\u26A0\uFE0F")} Some issues could not be automatically fixed`);
          console.log(formatDiagnostics(fixedReport));
        }
      }
      throw new CLIError("Configuration validation failed", 1);
    }
    console.log(`\\n${green("\u2705")} Configuration is valid`);
  } catch (error) {
    if (error instanceof ConfigValidationError2) {
      const report = diagnoseConfig({}, error);
      if (process.env.HATAGO_JSON_OUTPUT === "true") {
        outputResult({
          valid: false,
          issues: report.issues
        });
        return;
      }
      console.log(formatDiagnostics(report));
      throw new CLIError("Configuration validation failed", 1);
    }
    throw error;
  }
}
async function handleDoctor() {
  try {
    const result = await loadConfig({ validate: false });
    const report = diagnoseConfig(result.config);
    if (process.env.HATAGO_JSON_OUTPUT === "true") {
      outputResult({
        configPath: result.filepath,
        issues: report.issues,
        canAutoFix: report.canAutoFix,
        recommendations: [
          "Run `hatago config validate --fix` to apply automatic fixes",
          "Check external server connectivity with `hatago add-server <endpoint> --test`",
          "Review tool mappings for potential conflicts"
        ]
      });
      return;
    }
    console.log(`\u{1F3E5} ${cyan2("Hatago Configuration Doctor")}`);
    console.log("=".repeat(50));
    if (result.filepath) {
      console.log(`\\n\u{1F4CB} Configuration file: ${cyan2(result.filepath)}`);
    } else {
      console.log(`\\n\u{1F4CB} Using default configuration (no config file found)`);
    }
    console.log(`\\n\u{1F30D} Environment:`);
    console.log(`   Node.js: ${process.version}`);
    console.log(`   Platform: ${process.platform}`);
    console.log(`   Working directory: ${process.cwd()}`);
    console.log(formatDiagnostics(report));
    console.log(`\\n\u{1F4A1} Recommendations:`);
    const recommendations = [
      "Run periodic health checks on external servers",
      "Use HTTPS endpoints for production deployments",
      "Set up proper authentication for external APIs",
      "Review log levels based on your environment"
    ];
    recommendations.forEach((rec) => {
      console.log(`   \u2022 ${rec}`);
    });
    if (!report.hasErrors && !report.hasWarnings) {
      console.log(`\\n${green("\u{1F389} Your configuration looks great!")}`);
    }
  } catch (error) {
    console.error(`\\n${red2("\u274C")} Doctor check failed: ${error}`);
    throw new CLIError("Doctor check failed", 1);
  }
}
async function handleInit(options) {
  const configPath = resolve("hatago.config.jsonc");
  if (existsSync(configPath) && !options.force) {
    throw new CLIError(
      `Configuration file already exists: ${configPath}\\nUse --force to overwrite`,
      1
    );
  }
  const template = generateConfigTemplate();
  writeFileSync(configPath, template);
  outputResult(
    { configPath, created: true },
    `${green("\u2705")} Created configuration file: ${cyan2(configPath)}`
  );
}
async function handleGet(path) {
  const result = await loadConfig();
  if (!path) {
    outputResult(result.config, JSON.stringify(result.config, null, 2));
    return;
  }
  const parts = path.split(".");
  let current = result.config;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      throw new CLIError(`Configuration path not found: ${path}`, 1);
    }
  }
  outputResult(
    { path, value: current },
    JSON.stringify(current, null, 2)
  );
}
var configCommand = new Command("config").description("Manage Hatago configuration");
configCommand.command("validate").description("Validate configuration file").option("--fix", "Automatically fix common issues").action(handleValidate);
configCommand.command("doctor").alias("dr").description("Run comprehensive configuration diagnostics").action(handleDoctor);
configCommand.command("init").description("Create a new configuration file").option("-f, --force", "Overwrite existing configuration file").action(handleInit);
configCommand.command("get [path]").description("Get configuration value(s)").action(handleGet);
configCommand.on("--help", () => {
  console.log(`
Examples:
  hatago config validate              Validate current configuration
  hatago config validate --fix       Validate and auto-fix issues
  hatago config doctor                Run comprehensive health check
  hatago config init                  Create new configuration file
  hatago config get                   Show entire configuration
  hatago config get server.port      Get specific configuration value
  hatago config get proxy.servers    Get proxy server list
`);
});

// src/commands/init.ts
import { Command as Command2 } from "commander";
import { writeFileSync as writeFileSync2, existsSync as existsSync2, mkdirSync } from "fs";
import { resolve as resolve2, join } from "path";
import { green as green2, cyan as cyan3, blue } from "colorette";
import { generateConfigTemplate as generateConfigTemplate2 } from "@hatago/config";
function outputResult2(data, message) {
  if (process.env.HATAGO_JSON_OUTPUT === "true") {
    console.log(JSON.stringify(data, null, 2));
  } else if (message) {
    console.log(message);
  }
}
function generatePackageJson(projectName, template) {
  const basePackage = {
    name: projectName,
    version: "0.1.0",
    description: "Hatago MCP server project",
    type: "module",
    main: "dist/index.js",
    scripts: {
      dev: "hatago dev",
      build: "tsc",
      start: "node dist/index.js",
      typecheck: "tsc --noEmit"
    },
    keywords: ["hatago", "mcp", "server"],
    author: "",
    license: "MIT",
    dependencies: {
      "@hono/mcp": "file:../../docs/dist",
      hono: "^4.6.0"
    },
    devDependencies: {
      "@types/node": "^20.0.0",
      typescript: "^5.0.0"
    }
  };
  if (template === "with-proxy" || template === "plugin-only") {
    basePackage.dependencies["@hatago/config"] = "workspace:*";
  }
  return JSON.stringify(basePackage, null, 2);
}
function generateTsConfig() {
  return JSON.stringify({
    extends: "../../tsconfig.base.json",
    compilerOptions: {
      outDir: "./dist",
      rootDir: "./src"
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "dist"]
  }, null, 2);
}
function generateBasicServer(projectName) {
  return `import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { McpServer } from '@hono/mcp'
import { StreamableHTTPTransport } from '@hono/mcp'

const app = new Hono()
const server = new McpServer({
  name: '${projectName}',
  version: '0.1.0',
  description: 'A simple Hatago MCP server',
})

// Add a simple hello tool
server.registerTool({
  name: 'hello',
  description: 'Say hello with a custom message',
  inputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'The message to include in the greeting',
        default: 'world',
      },
    },
  },
}, async ({ message = 'world' }) => {
  return {
    content: [
      {
        type: 'text',
        text: \`Hello, \${message}! This is your Hatago MCP server.\`,
      },
    ],
  }
})

// Health check endpoint
app.get('/health', (c) => c.json({ status: 'ok', server: '${projectName}' }))

// MCP endpoint
app.all('/mcp', async (c) => {
  const transport = new StreamableHTTPTransport()
  await server.connect(transport)
  return transport.handleRequest(c)
})

// Start server
const port = Number(process.env.PORT) || 8787
console.log(\`\u{1F680} \${server.name} is running on http://localhost:\${port}\`)
console.log(\`\u{1F4CB} Health check: http://localhost:\${port}/health\`)
console.log(\`\u{1F50C} MCP endpoint: http://localhost:\${port}/mcp\`)

serve({
  fetch: app.fetch,
  port,
})
`;
}
function generatePluginServer(projectName) {
  return `import { createHatagoApp } from '@hatago/core'
import { loadConfig } from '@hatago/config'
import { helloPlugin } from './plugins/hello.js'

async function main() {
  // Load configuration
  const { config } = await loadConfig()
  
  // Create Hatago app with plugins
  const { app, server } = createHatagoApp({
    name: '${projectName}',
    version: '0.1.0',
    description: 'A plugin-based Hatago MCP server',
    config,
    plugins: [
      helloPlugin,
    ],
  })

  // Start server
  const port = config.server?.port || 8787
  console.log(\`\u{1F680} \${server.name} is running on http://localhost:\${port}\`)
  console.log(\`\u{1F4CB} Health check: http://localhost:\${port}/health\`)
  console.log(\`\u{1F50C} MCP endpoint: http://localhost:\${port}/mcp\`)

  const { serve } = await import('@hono/node-server')
  serve({
    fetch: app.fetch,
    port,
  })
}

main().catch(console.error)
`;
}
function generateHelloPlugin() {
  return `import type { HatagoPlugin } from '@hatago/core'

export const helloPlugin: HatagoPlugin = ({ server }) => {
  server.registerTool({
    name: 'hello',
    description: 'Say hello with a custom message',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The message to include in the greeting',
          default: 'world',
        },
      },
    },
  }, async ({ message = 'world' }) => {
    return {
      content: [
        {
          type: 'text',
          text: \`Hello, \${message}! This is from a Hatago plugin.\`,
        },
      ],
    }
  })
}
`;
}
function generateGitignore() {
  return `# Dependencies
node_modules/
.pnpm-lock.yaml
yarn.lock
package-lock.json

# Build output
dist/
build/

# Environment variables
.env
.env.local
.env.development
.env.production

# Logs
*.log
logs/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# TypeScript
*.tsbuildinfo
`;
}
function generateReadme(projectName, template) {
  return `# ${projectName}

A Hatago MCP server project${template === "with-proxy" ? " with external MCP proxy support" : template === "plugin-only" ? " using plugin architecture" : ""}.

## Getting Started

1. Install dependencies:
   \`\`\`bash
   pnpm install
   \`\`\`

2. Start development server:
   \`\`\`bash
   pnpm dev
   \`\`\`

3. Test the server:
   \`\`\`bash
   curl http://localhost:8787/health
   \`\`\`

## Available Commands

- \`pnpm dev\` - Start development server with hot reload
- \`pnpm build\` - Build the project
- \`pnpm start\` - Start production server
- \`pnpm typecheck\` - Run TypeScript type checking

## Project Structure

\`\`\`
${projectName}/
\u251C\u2500\u2500 src/
\u2502   \u251C\u2500\u2500 index.ts          # Main server entry point
${template === "plugin-only" ? "\u2502   \u2514\u2500\u2500 plugins/\n\u2502       \u2514\u2500\u2500 hello.ts      # Example plugin" : ""}
\u251C\u2500\u2500 hatago.config.jsonc   # Hatago configuration${template === "with-proxy" ? " (with proxy setup)" : ""}
\u251C\u2500\u2500 package.json
\u251C\u2500\u2500 tsconfig.json
\u2514\u2500\u2500 README.md
\`\`\`

## Configuration

${template === "basic" ? "This project uses a basic Hatago setup. Configuration is handled through environment variables and the main server file." : "Configuration is managed through `hatago.config.jsonc`. See the [Hatago documentation](https://hatago.dev/docs) for available options."}

## Adding Tools

${template === "basic" ? "Add new MCP tools by registering them with the server instance in `src/index.ts`." : "Create new plugins in the `src/plugins/` directory and register them in `src/index.ts`."}

## Deployment

1. Build the project:
   \`\`\`bash
   pnpm build
   \`\`\`

2. Start the production server:
   \`\`\`bash
   pnpm start
   \`\`\`

For more information, visit the [Hatago documentation](https://hatago.dev).
`;
}
function generateProjectConfig(template, port) {
  if (template === "basic") {
    return generateConfigTemplate2();
  }
  const config = {
    $schema: "https://hatago.dev/schema/config.json",
    server: {
      port,
      hostname: "localhost",
      cors: true,
      timeout: 3e4
    },
    logging: {
      level: "info",
      format: "pretty",
      output: "console"
    },
    security: {
      requireAuth: false,
      allowedOrigins: ["*"]
    }
  };
  if (template === "with-proxy") {
    config.proxy = {
      servers: [],
      namespaceStrategy: "prefix",
      conflictResolution: "error",
      namespace: {
        separator: ":",
        caseSensitive: false,
        maxLength: 64
      }
    };
  }
  return JSON.stringify(config, null, 2);
}
async function handleInit2(projectPath, options) {
  const {
    template = "basic",
    name,
    port = 8787,
    force = false,
    skipInstall = false,
    packageManager = "pnpm"
  } = options;
  const fullPath = resolve2(projectPath);
  const projectName = name || projectPath;
  if (existsSync2(fullPath) && !force) {
    throw new CLIError(
      `Directory already exists: ${fullPath}\\nUse --force to overwrite`,
      1
    );
  }
  if (process.env.HATAGO_JSON_OUTPUT === "true") {
    outputResult2({
      projectPath: fullPath,
      projectName,
      template,
      created: true
    });
    return;
  }
  console.log(`\\n\u{1F680} ${cyan3("Creating new Hatago project...")}`);
  console.log(`\u{1F4C1} Project: ${blue(projectName)}`);
  console.log(`\u{1F4C2} Location: ${fullPath}`);
  console.log(`\u{1F3A8} Template: ${template}`);
  console.log(`\u{1F310} Port: ${port}`);
  mkdirSync(fullPath, { recursive: true });
  const srcDir = join(fullPath, "src");
  mkdirSync(srcDir, { recursive: true });
  const files = {
    "package.json": generatePackageJson(projectName, template),
    "tsconfig.json": generateTsConfig(),
    ".gitignore": generateGitignore(),
    "README.md": generateReadme(projectName, template),
    "hatago.config.jsonc": generateProjectConfig(template, port)
  };
  if (template === "basic") {
    files["src/index.ts"] = generateBasicServer(projectName);
  } else {
    files["src/index.ts"] = generatePluginServer(projectName);
    if (template === "plugin-only") {
      const pluginsDir = join(srcDir, "plugins");
      mkdirSync(pluginsDir, { recursive: true });
      files["src/plugins/hello.ts"] = generateHelloPlugin();
    }
  }
  for (const [filePath, content] of Object.entries(files)) {
    const fullFilePath = join(fullPath, filePath);
    writeFileSync2(fullFilePath, content);
    console.log(`   ${green2("\u2713")} ${filePath}`);
  }
  console.log(`\\n${green2("\u2705")} Project created successfully!`);
  if (!skipInstall) {
    console.log(`\\n\u{1F4E6} Installing dependencies with ${packageManager}...`);
    console.log(`\u{1F4A1} Run \`cd ${projectName} && ${packageManager} install\` to install dependencies`);
  }
  console.log(`\\n\u{1F3AF} Next steps:`);
  console.log(`   1. cd ${projectName}`);
  if (!skipInstall) {
    console.log(`   2. ${packageManager} install`);
  }
  console.log(`   ${skipInstall ? "2" : "3"}. ${packageManager} dev`);
  console.log(`\\n\u{1F4DA} Learn more: https://hatago.dev/docs`);
}
var initCommand = new Command2("init").description("Initialize a new Hatago project").argument("<project-name>", "Name of the project directory").option("-t, --template <type>", "Project template (basic|with-proxy|plugin-only)", "basic").option("-n, --name <name>", "Project name (defaults to directory name)").option("-p, --port <port>", "Server port", "8787").option("-f, --force", "Overwrite existing directory").option("--skip-install", "Skip dependency installation").option("--pm <manager>", "Package manager (npm|pnpm|yarn)", "pnpm").action(handleInit2);
initCommand.on("--help", () => {
  console.log(`
Examples:
  hatago init my-server                     Create basic server
  hatago init my-server --template with-proxy  Create server with proxy support
  hatago init my-server --template plugin-only Create plugin-based server
  hatago init my-server --port 3000         Create server on custom port
  hatago init my-server --force             Overwrite existing directory
`);
});

// src/commands/dev.ts
import { Command as Command3 } from "commander";
import { spawn } from "child_process";
import { watch } from "fs";
import { resolve as resolve3 } from "path";
import { existsSync as existsSync3 } from "fs";
import { green as green3, red as red4, yellow as yellow5, cyan as cyan4, blue as blue2, gray } from "colorette";
import { loadConfig as loadConfig2 } from "@hatago/config";
function outputResult3(data, message) {
  if (process.env.HATAGO_JSON_OUTPUT === "true") {
    console.log(JSON.stringify(data, null, 2));
  } else if (message) {
    console.log(message);
  }
}
function clearScreen(enabled) {
  if (enabled && process.stdout.isTTY) {
    process.stdout.write("\\x1b[2J\\x1b[0f");
  }
}
function formatTime() {
  return (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", { hour12: false });
}
function logWithTime(message, color = gray) {
  console.log(`${color(`[${formatTime()}]`)} ${message}`);
}
function findTscCommand() {
  const tscPaths = [
    "node_modules/.bin/tsc",
    "pnpm exec tsc",
    "npx tsc",
    "tsc"
  ];
  for (const tscPath of tscPaths) {
    try {
      if (tscPath.includes("/")) {
        if (existsSync3(tscPath)) return tscPath;
      } else {
        return tscPath;
      }
    } catch {
      continue;
    }
  }
  return "npx tsc";
}
async function buildProject(verbose) {
  return new Promise((resolve7) => {
    const tscCommand = findTscCommand();
    const args = tscCommand.split(" ");
    const cmd = args.shift();
    if (verbose) {
      logWithTime(`Building with: ${tscCommand}`, cyan4);
    }
    const buildProcess = spawn(cmd, args, {
      stdio: verbose ? "inherit" : "pipe",
      shell: true
    });
    buildProcess.on("close", (code) => {
      resolve7(code === 0);
    });
    buildProcess.on("error", () => {
      resolve7(false);
    });
  });
}
function startServer(devServer, options) {
  const { config } = devServer;
  const port = options.port || config.server?.port || 8787;
  const hostname = options.hostname || config.server?.hostname || "localhost";
  const nodeArgs = [];
  if (options.inspect) {
    const inspectPort = options.inspectPort || 9229;
    nodeArgs.push(`--inspect=${inspectPort}`);
  }
  const serverScript = resolve3("dist/index.js");
  if (!existsSync3(serverScript)) {
    throw new CLIError(
      `Server script not found: ${serverScript}\\nRun build first or check your TypeScript configuration`,
      1
    );
  }
  nodeArgs.push(serverScript);
  devServer.process = spawn("node", nodeArgs, {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: hostname,
      NODE_ENV: "development",
      HATAGO_DEV: "true"
    }
  });
  devServer.startTime = Date.now();
  devServer.process.on("close", (code) => {
    if (!devServer.isRestarting) {
      if (code === 0) {
        logWithTime("Server stopped", yellow5);
      } else {
        logWithTime(`Server exited with code ${code}`, red4);
      }
    }
  });
  devServer.process.on("error", (error) => {
    logWithTime(`Server error: ${error.message}`, red4);
  });
  const startupTime = Date.now() - devServer.startTime;
  logWithTime(`\u{1F680} Server started in ${startupTime}ms`, green3);
  logWithTime(`\u{1F4CB} Health: http://${hostname}:${port}/health`, cyan4);
  logWithTime(`\u{1F50C} MCP: http://${hostname}:${port}/mcp`, cyan4);
}
function stopServer(devServer) {
  return new Promise((resolve7) => {
    if (!devServer.process) {
      resolve7();
      return;
    }
    devServer.process.on("close", () => {
      devServer.process = null;
      resolve7();
    });
    devServer.process.kill("SIGTERM");
    setTimeout(() => {
      if (devServer.process) {
        devServer.process.kill("SIGKILL");
        devServer.process = null;
        resolve7();
      }
    }, 5e3);
  });
}
async function restartServer(devServer, options) {
  devServer.isRestarting = true;
  logWithTime("\u{1F504} Restarting server...", yellow5);
  await stopServer(devServer);
  const buildSuccess = await buildProject(options.verbose || false);
  if (!buildSuccess) {
    logWithTime("\u274C Build failed, keeping previous version", red4);
    devServer.isRestarting = false;
    return;
  }
  startServer(devServer, options);
  devServer.isRestarting = false;
}
function setupWatcher(devServer, options) {
  const watchPaths = options.watch || ["src"];
  for (const watchPath of watchPaths) {
    if (!existsSync3(watchPath)) {
      logWithTime(`\u26A0\uFE0F  Watch path not found: ${watchPath}`, yellow5);
      continue;
    }
    logWithTime(`\u{1F440} Watching: ${watchPath}`, gray);
    const watcher = watch(watchPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      if (!filename.endsWith(".ts") && !filename.endsWith(".js") && !filename.endsWith(".json")) {
        return;
      }
      if (filename.includes("node_modules") || filename.includes("dist")) {
        return;
      }
      logWithTime(`\u{1F4DD} Changed: ${filename}`, gray);
      clearTimeout(restartServer.timeout);
      restartServer.timeout = setTimeout(() => {
        restartServer(devServer, options);
      }, 300);
    });
    process.on("SIGINT", () => {
      watcher.close();
    });
  }
}
function openBrowser(url) {
  const startCommand = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  spawn(startCommand, [url], { stdio: "ignore" });
}
async function handleDev(options) {
  try {
    const { config, filepath } = await loadConfig2();
    if (process.env.HATAGO_JSON_OUTPUT === "true") {
      outputResult3({
        action: "dev-start",
        configPath: filepath,
        config: {
          port: options.port || config.server?.port || 8787,
          hostname: options.hostname || config.server?.hostname || "localhost"
        },
        watch: options.watch || ["src"]
      });
      return;
    }
    clearScreen(options.clearScreen !== false);
    console.log(`\\n\u{1F525} ${cyan4("Hatago Development Server")}`);
    console.log("=".repeat(50));
    if (filepath) {
      logWithTime(`\u{1F4CB} Config: ${filepath}`, gray);
    } else {
      logWithTime("\u{1F4CB} Using default configuration", gray);
    }
    const devServer = {
      process: null,
      config,
      isRestarting: false,
      startTime: 0
    };
    logWithTime("\u{1F528} Building project...", cyan4);
    const buildSuccess = await buildProject(options.verbose || false);
    if (!buildSuccess) {
      throw new CLIError("Initial build failed", 1);
    }
    startServer(devServer, options);
    setupWatcher(devServer, options);
    if (options.open) {
      const hostname = options.hostname || config.server?.hostname || "localhost";
      const port = options.port || config.server?.port || 8787;
      const url = `http://${hostname}:${port}/health`;
      setTimeout(() => {
        openBrowser(url);
        logWithTime(`\u{1F310} Opened browser: ${url}`, cyan4);
      }, 1e3);
    }
    logWithTime("\u2705 Development server ready", green3);
    if (options.inspect) {
      const inspectPort = options.inspectPort || 9229;
      logWithTime(`\u{1F50D} Debugger: chrome://inspect (port ${inspectPort})`, blue2);
    }
    console.log(`\\n${gray("Press Ctrl+C to stop the server")}`);
    process.on("SIGINT", async () => {
      console.log(`\\n\\n${yellow5("\u{1F6D1} Shutting down development server...")}`);
      await stopServer(devServer);
      console.log(`${green3("\u2705")} Server stopped`);
      process.exit(0);
    });
    process.on("SIGTERM", async () => {
      await stopServer(devServer);
      process.exit(0);
    });
  } catch (error) {
    if (error instanceof CLIError) {
      throw error;
    }
    throw new CLIError(`Development server failed: ${error}`, 1);
  }
}
var devCommand = new Command3("dev").description("Start development server with hot reload").option("-p, --port <port>", "Server port", (val) => parseInt(val, 10)).option("-H, --hostname <hostname>", "Server hostname").option("-w, --watch <paths...>", "Additional paths to watch for changes").option("--inspect", "Enable Node.js inspector for debugging").option("--inspect-port <port>", "Inspector port", (val) => parseInt(val, 10), 9229).option("--no-clear-screen", "Disable clearing screen on restart").option("--open", "Open browser after server starts").action(handleDev);
devCommand.on("--help", () => {
  console.log(`
Examples:
  hatago dev                              Start development server
  hatago dev --port 3000                 Start on custom port
  hatago dev --hostname 0.0.0.0          Listen on all interfaces
  hatago dev --watch src --watch config  Watch additional directories
  hatago dev --inspect                   Enable debugging
  hatago dev --open                      Open browser automatically
`);
});

// src/commands/add-server.ts
import { Command as Command4 } from "commander";
import { writeFileSync as writeFileSync3 } from "fs";
import { resolve as resolve4 } from "path";
import { green as green4, red as red5, yellow as yellow6, cyan as cyan5 } from "colorette";
import {
  loadConfig as loadConfig3,
  validateConfig as validateConfig2,
  ConfigValidationError as ConfigValidationError3
} from "@hatago/config";
function outputResult4(data, message) {
  if (process.env.HATAGO_JSON_OUTPUT === "true") {
    console.log(JSON.stringify(data, null, 2));
  } else if (message) {
    console.log(message);
  }
}
async function testMcpServer(endpoint, auth) {
  try {
    const headers = {
      "Content-Type": "application/json"
    };
    if (auth) {
      if (auth.type === "bearer" && auth.token) {
        headers["Authorization"] = `Bearer ${auth.token}`;
      } else if (auth.type === "basic" && auth.username && auth.password) {
        const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString("base64");
        headers["Authorization"] = `Basic ${credentials}`;
      }
    }
    const initRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: {
          name: "hatago-cli",
          version: "0.1.0"
        }
      }
    };
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(initRequest)
    });
    if (!response.ok) {
      console.error(`\u274C HTTP ${response.status}: ${response.statusText}`);
      return false;
    }
    const result = await response.json();
    if (result.error) {
      console.error(`\u274C MCP Error: ${result.error.message}`);
      return false;
    }
    console.log(`\u2705 Server responded: ${result.result?.serverInfo?.name || "Unknown"}`);
    return true;
  } catch (error) {
    console.error(`\u274C Connection failed: ${error}`);
    return false;
  }
}
async function promptInput(question, defaultValue) {
  return new Promise((resolve7) => {
    const { createInterface } = __require("readline");
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    const prompt = defaultValue ? `${question} (${defaultValue}): ` : `${question}: `;
    rl.question(prompt, (answer) => {
      rl.close();
      resolve7(answer.trim() || defaultValue || "");
    });
  });
}
async function interactiveConfig(endpoint) {
  console.log(`\\n\u{1F527} ${cyan5("Interactive Configuration")}`);
  console.log("=".repeat(40));
  const config = {
    endpoint
  };
  config.id = await promptInput("Server ID", generateServerId(endpoint));
  config.namespace = await promptInput("Namespace", config.id);
  config.description = await promptInput("Description (optional)");
  const needsAuth = await promptInput("Requires authentication? (y/N)", "n");
  if (needsAuth.toLowerCase() === "y") {
    const authType = await promptInput("Auth type (bearer/basic)", "bearer");
    config.auth = { type: authType };
    if (authType === "bearer") {
      config.auth.token = await promptInput("Bearer token");
    } else if (authType === "basic") {
      config.auth.username = await promptInput("Username");
      config.auth.password = await promptInput("Password");
    }
  }
  const advancedConfig = await promptInput("Configure advanced options? (y/N)", "n");
  if (advancedConfig.toLowerCase() === "y") {
    const timeoutStr = await promptInput("Timeout (ms)", "30000");
    config.timeout = parseInt(timeoutStr, 10);
    const enableHealthCheck = await promptInput("Enable health checks? (Y/n)", "y");
    if (enableHealthCheck.toLowerCase() !== "n") {
      config.healthCheck = {
        enabled: true,
        interval: 3e4,
        timeout: 5e3
      };
    }
  }
  return config;
}
function generateServerId(endpoint) {
  try {
    const url = new URL(endpoint);
    const hostname = url.hostname.replace(/\\./g, "-");
    const port = url.port ? `-${url.port}` : "";
    return `${hostname}${port}`;
  } catch {
    return "mcp-server";
  }
}
async function updateConfigFile(newServer, dryRun = false) {
  const { config, filepath } = await loadConfig3();
  if (!config.proxy) {
    config.proxy = {
      servers: [],
      namespaceStrategy: "prefix",
      conflictResolution: "error",
      namespace: {
        separator: ":",
        caseSensitive: false,
        maxLength: 64
      }
    };
  }
  const existingIndex = config.proxy.servers.findIndex((s) => s.id === newServer.id);
  if (existingIndex >= 0) {
    config.proxy.servers[existingIndex] = newServer;
    console.log(`\u270F\uFE0F  Updated existing server: ${cyan5(newServer.id)}`);
  } else {
    config.proxy.servers.push(newServer);
    console.log(`\u2705 Added new server: ${cyan5(newServer.id)}`);
  }
  try {
    validateConfig2(config);
  } catch (error) {
    if (error instanceof ConfigValidationError3) {
      console.error(`\\n${red5("\u274C")} Configuration validation failed:`);
      for (const issue of error.zodError.issues) {
        const path = issue.path.join(".");
        console.error(`   \u2022 ${path}: ${issue.message}`);
      }
      throw new CLIError("Configuration validation failed", 1);
    }
    throw error;
  }
  if (dryRun) {
    console.log(`\\n${yellow6("\u{1F4CB}")} Dry run - configuration not saved`);
    console.log("Updated configuration:");
    console.log(JSON.stringify(config, null, 2));
    return;
  }
  const configPath = filepath || resolve4("hatago.config.jsonc");
  const configContent = JSON.stringify(config, null, 2);
  writeFileSync3(configPath, configContent);
  console.log(`\u{1F4BE} Configuration saved to: ${configPath}`);
}
async function handleAddServer(endpoint, options) {
  try {
    if (!endpoint) {
      throw new CLIError("Endpoint URL is required", 1);
    }
    try {
      new URL(endpoint);
    } catch {
      throw new CLIError(`Invalid endpoint URL: ${endpoint}`, 1);
    }
    if (process.env.HATAGO_JSON_OUTPUT === "true") {
      outputResult4({
        action: "add-server",
        endpoint,
        options
      });
      return;
    }
    console.log(`\\n\u{1F50C} ${cyan5("Adding MCP Server")}`);
    console.log("=".repeat(40));
    console.log(`\u{1F4E1} Endpoint: ${endpoint}`);
    let serverConfig;
    if (options.interactive) {
      serverConfig = await interactiveConfig(endpoint);
    } else {
      serverConfig = {
        endpoint,
        id: options.id || generateServerId(endpoint),
        namespace: options.namespace,
        description: options.description,
        timeout: options.timeout || 3e4
      };
      if (options.authType) {
        serverConfig.auth = {
          type: options.authType,
          token: options.authToken,
          username: options.authUsername,
          password: options.authPassword
        };
      }
      if (options.include || options.exclude || options.rename) {
        serverConfig.tools = {
          include: options.include || ["*"],
          exclude: options.exclude,
          rename: options.rename
        };
      }
      if (options.healthCheck) {
        serverConfig.healthCheck = {
          enabled: true,
          interval: 3e4,
          timeout: 5e3
        };
      }
    }
    if (options.test) {
      console.log(`\\n\u{1F9EA} ${yellow6("Testing connection...")}`);
      const testResult = await testMcpServer(endpoint, serverConfig.auth);
      if (!testResult) {
        console.log(`\\n${yellow6("\u26A0\uFE0F  Connection test failed, but server will still be added")}`);
        console.log("You can test the connection later with: hatago test-server <id>");
      } else {
        console.log(`\\n${green4("\u2705")} Connection test passed`);
      }
    }
    await updateConfigFile(serverConfig, options.dry);
    if (!options.dry) {
      console.log(`\\n\u{1F3AF} Next steps:`);
      console.log(`   1. Test the server: hatago test-server ${serverConfig.id}`);
      console.log(`   2. Start development server: hatago dev`);
      console.log(`   3. Verify tools are available via MCP endpoint`);
    }
  } catch (error) {
    if (error instanceof CLIError) {
      throw error;
    }
    throw new CLIError(`Failed to add server: ${error}`, 1);
  }
}
var addServerCommand = new Command4("add-server").description("Add external MCP server to configuration").argument("<endpoint>", "MCP server endpoint URL").option("-i, --id <id>", "Server identifier").option("-n, --namespace <namespace>", "Tool namespace").option("-d, --description <description>", "Server description").option("-t, --timeout <timeout>", "Request timeout in milliseconds", (val) => parseInt(val, 10)).option("--auth-type <type>", "Authentication type (bearer|basic|custom)").option("--auth-token <token>", "Bearer token or API key").option("--auth-username <username>", "Username for basic auth").option("--auth-password <password>", "Password for basic auth").option("--test", "Test connection before adding").option("--include <tools...>", "Include specific tools (glob patterns)").option("--exclude <tools...>", "Exclude specific tools (glob patterns)").option("--rename <mapping>", "Rename tools (format: old=new,old2=new2)").option("--health-check", "Enable health checks").option("--interactive", "Interactive configuration mode").option("--dry", "Show configuration changes without saving").action((endpoint, options) => {
  if (options.rename) {
    const pairs = options.rename.split(",");
    options.rename = {};
    for (const pair of pairs) {
      const [old, newName] = pair.split("=");
      if (old && newName) {
        options.rename[old.trim()] = newName.trim();
      }
    }
  }
  return handleAddServer(endpoint, options);
});
addServerCommand.on("--help", () => {
  console.log(`
Examples:
  # Basic server addition
  hatago add-server http://localhost:8080/mcp
  
  # With custom configuration
  hatago add-server http://localhost:8080/mcp \\
    --id my-server \\
    --namespace mytools \\
    --description "My custom MCP server"
  
  # With authentication
  hatago add-server https://api.example.com/mcp \\
    --auth-type bearer \\
    --auth-token "your-api-token"
  
  # With tool filtering
  hatago add-server http://localhost:8080/mcp \\
    --include "calc.*" "time.*" \\
    --exclude "debug.*" \\
    --rename "oldName=newName,tool1=myTool"
  
  # Interactive mode
  hatago add-server http://localhost:8080/mcp --interactive
  
  # Test connection and dry run
  hatago add-server http://localhost:8080/mcp --test --dry
`);
});

// src/commands/create-plugin.ts
import { Command as Command5 } from "commander";
import { resolve as resolve5, join as join3, dirname as dirname2 } from "path";
import { fileURLToPath } from "url";
import { existsSync as existsSync4 } from "fs";
import { green as green5, red as red6, yellow as yellow7, cyan as cyan6, blue as blue4, gray as gray2 } from "colorette";
import { TemplateEngine } from "@hatago/config";
function outputResult5(data, message) {
  if (process.env.HATAGO_JSON_OUTPUT === "true") {
    console.log(JSON.stringify(data, null, 2));
  } else if (message) {
    console.log(message);
  }
}
async function promptInput2(question, defaultValue) {
  return new Promise((resolve7) => {
    const { createInterface } = __require("readline");
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    const prompt = defaultValue ? `${question} (${defaultValue}): ` : `${question}: `;
    rl.question(prompt, (answer) => {
      rl.close();
      resolve7(answer.trim() || defaultValue || "");
    });
  });
}
async function promptConfirm(question, defaultValue = false) {
  const answer = await promptInput2(`${question} (${defaultValue ? "Y/n" : "y/N"})`, defaultValue ? "y" : "n");
  return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
}
async function promptSelect(question, choices, defaultValue) {
  console.log(`\\n${question}`);
  choices.forEach((choice, index2) => {
    const marker = choice === defaultValue ? ">" : " ";
    console.log(`${marker} ${index2 + 1}. ${choice}`);
  });
  const answer = await promptInput2("Select option", defaultValue ? String(choices.indexOf(defaultValue) + 1) : "1");
  const index = parseInt(answer, 10) - 1;
  if (index >= 0 && index < choices.length) {
    return choices[index];
  }
  return defaultValue || choices[0];
}
async function interactivePrompt(templateConfig) {
  const context = {};
  console.log(`\\n\u{1F527} ${cyan6("Interactive Plugin Configuration")}`);
  console.log("=".repeat(50));
  console.log(`Template: ${blue4(templateConfig.displayName)}`);
  console.log(`Description: ${gray2(templateConfig.description)}`);
  console.log("");
  for (const prompt of templateConfig.prompts) {
    if (prompt.when && !context[prompt.when]) {
      continue;
    }
    try {
      switch (prompt.type) {
        case "input":
          context[prompt.name] = await promptInput2(prompt.message, prompt.default);
          break;
        case "confirm":
          context[prompt.name] = await promptConfirm(prompt.message, prompt.default);
          break;
        case "select":
          if (!prompt.choices) {
            throw new Error(`Select prompt '${prompt.name}' must have choices`);
          }
          context[prompt.name] = await promptSelect(prompt.message, prompt.choices, prompt.default);
          break;
        case "array":
          if (!prompt.itemPrompts) {
            context[prompt.name] = [];
            break;
          }
          const items = [];
          let addMore = true;
          console.log(`\\n${prompt.message}`);
          while (addMore) {
            const item = {};
            console.log(`\\n  Adding item ${items.length + 1}:`);
            for (const itemPrompt of prompt.itemPrompts) {
              switch (itemPrompt.type) {
                case "input":
                  item[itemPrompt.name] = await promptInput2(`    ${itemPrompt.message}`, itemPrompt.default);
                  if (itemPrompt.required && !item[itemPrompt.name]) {
                    console.log(`    ${red6("Error:")} ${itemPrompt.message} is required`);
                    item[itemPrompt.name] = await promptInput2(`    ${itemPrompt.message}`);
                  }
                  break;
                case "select":
                  if (itemPrompt.choices) {
                    item[itemPrompt.name] = await promptSelect(`    ${itemPrompt.message}`, itemPrompt.choices, itemPrompt.default);
                  }
                  break;
                case "confirm":
                  item[itemPrompt.name] = await promptConfirm(`    ${itemPrompt.message}`, itemPrompt.default);
                  break;
              }
            }
            items.push(item);
            addMore = await promptConfirm("  Add another item?", false);
          }
          context[prompt.name] = items;
          break;
        default:
          console.log(`${yellow7("Warning:")} Unknown prompt type: ${prompt.type}`);
      }
    } catch (error) {
      console.error(`${red6("Error:")} Failed to process prompt '${prompt.name}': ${error}`);
    }
  }
  return context;
}
function getTemplatesDir() {
  const __dirname2 = dirname2(fileURLToPath(import.meta.url));
  const possiblePaths = [
    resolve5("templates"),
    resolve5("node_modules/@hatago/templates"),
    resolve5(__dirname2, "../../../templates"),
    resolve5(__dirname2, "../../../../templates")
  ];
  for (const path of possiblePaths) {
    if (existsSync4(path)) {
      return path;
    }
  }
  throw new CLIError("Templates directory not found. Make sure you are in a Hatago project or have templates installed.", 1);
}
async function handleCreatePlugin(pluginName, options) {
  try {
    if (!pluginName) {
      throw new CLIError("Plugin name is required", 1);
    }
    if (!/^[a-zA-Z][a-zA-Z0-9-_]*$/.test(pluginName)) {
      throw new CLIError("Plugin name must start with a letter and contain only letters, numbers, hyphens, and underscores", 1);
    }
    const templatesDir = getTemplatesDir();
    const engine = new TemplateEngine();
    if (process.env.HATAGO_JSON_OUTPUT === "true") {
      outputResult5({
        action: "create-plugin",
        pluginName,
        templatesDir,
        options
      });
      return;
    }
    console.log(`\\n\u{1F50C} ${cyan6("Creating Hatago Plugin")}`);
    console.log("=".repeat(40));
    if (!options.template) {
      const templates = engine.listTemplates(templatesDir);
      const pluginTemplates = templates.filter((t) => t.category === "plugins");
      if (pluginTemplates.length === 0) {
        throw new CLIError("No plugin templates found", 1);
      }
      if (options.interactive && pluginTemplates.length > 1) {
        const choices = pluginTemplates.map((t) => `${t.name} - ${t.description}`);
        const selected = await promptSelect("Choose a template:", choices);
        options.template = pluginTemplates[choices.indexOf(selected)].name;
      } else {
        options.template = pluginTemplates[0].name;
      }
    }
    const templateDir = engine.findTemplate(templatesDir, options.template);
    if (!templateDir) {
      throw new CLIError(`Template not found: ${options.template}`, 1);
    }
    const validation = engine.validateTemplate(templateDir);
    if (!validation.valid) {
      throw new CLIError(`Invalid template: ${validation.errors.join(", ")}`, 1);
    }
    const templateConfig = engine.loadTemplateConfig(templateDir);
    console.log(`\u{1F4CB} Template: ${blue4(templateConfig.displayName)}`);
    console.log(`\u{1F4DD} Description: ${templateConfig.description}`);
    const outputDir = resolve5(options.output || join3("src", "plugins"));
    console.log(`\u{1F4C2} Output: ${outputDir}`);
    const pluginPath = join3(outputDir, `${pluginName}.ts`);
    if (existsSync4(pluginPath) && !options.force) {
      throw new CLIError(
        `Plugin already exists: ${pluginPath}\\nUse --force to overwrite`,
        1
      );
    }
    let context = {
      name: pluginName,
      version: "1.0.0",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      author: "Anonymous",
      description: `${pluginName} plugin for Hatago`
    };
    if (options.interactive) {
      const userContext = await interactivePrompt(templateConfig);
      context = { ...context, ...userContext };
    }
    const includeOptional = {
      tests: options.includeTests !== false,
      readme: options.includeReadme !== false
    };
    console.log(`\\n\u{1F528} ${yellow7("Generating plugin files...")}`);
    const result = engine.generateFromTemplate(templateDir, outputDir, context, {
      includeOptional: true,
      dryRun: options.dry
    });
    const filteredFiles = result.files.filter((file) => {
      if (file.path.includes(".test.") && !includeOptional.tests) {
        return false;
      }
      if (file.path.includes("README.md") && !includeOptional.readme) {
        return false;
      }
      return true;
    });
    if (options.dry) {
      console.log(`\\n${yellow7("\u{1F4CB}")} Dry run - files not created:`);
      filteredFiles.forEach((file) => {
        console.log(`   ${gray2("\u2022")} ${file.path}`);
      });
    } else {
      console.log(`\\n${green5("\u2705")} Plugin created successfully:`);
      filteredFiles.forEach((file) => {
        console.log(`   ${green5("\u2713")} ${file.path}`);
      });
      console.log(`\\n\u{1F3AF} Next steps:`);
      console.log(`   1. Review the generated plugin: ${pluginPath}`);
      console.log(`   2. Register plugin in your server: import { ${context.name}Plugin } from './plugins/${pluginName}.js'`);
      console.log(`   3. Add to plugins array in createHatagoApp()`);
      console.log(`   4. Start development server: hatago dev`);
      if (includeOptional.tests) {
        console.log(`   5. Run tests: pnpm test ${pluginName}`);
      }
    }
  } catch (error) {
    if (error instanceof CLIError) {
      throw error;
    }
    throw new CLIError(`Failed to create plugin: ${error}`, 1);
  }
}
var createPluginCommand = new Command5("create-plugin").description("Create a new Hatago plugin from template").argument("<plugin-name>", "Name of the plugin to create").option("-t, --template <name>", "Template name to use").option("-o, --output <dir>", "Output directory", "src/plugins").option("-i, --interactive", "Interactive configuration mode").option("--dry", "Show what would be created without actually creating files").option("--no-tests", "Skip test file generation").option("--no-readme", "Skip README file generation").option("-f, --force", "Overwrite existing plugin").action(handleCreatePlugin);
createPluginCommand.on("--help", () => {
  console.log(`
Examples:
  # Create basic plugin
  hatago create-plugin my-tool
  
  # Interactive mode with custom template
  hatago create-plugin my-tool --template basic --interactive
  
  # Custom output directory
  hatago create-plugin my-tool --output plugins/
  
  # Dry run to preview
  hatago create-plugin my-tool --dry
  
  # Skip optional files
  hatago create-plugin my-tool --no-tests --no-readme
  
  # Force overwrite existing plugin
  hatago create-plugin my-tool --force
`);
});

// src/commands/scaffold.ts
import { Command as Command6 } from "commander";
import { resolve as resolve6, join as join4, dirname as dirname3 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
import { existsSync as existsSync5 } from "fs";
import { green as green6, red as red7, yellow as yellow8, cyan as cyan7, blue as blue5, gray as gray3 } from "colorette";
import { TemplateEngine as TemplateEngine2 } from "@hatago/config";
function outputResult6(data, message) {
  if (process.env.HATAGO_JSON_OUTPUT === "true") {
    console.log(JSON.stringify(data, null, 2));
  } else if (message) {
    console.log(message);
  }
}
function getTemplatesDir2() {
  const __dirname2 = dirname3(fileURLToPath2(import.meta.url));
  const possiblePaths = [
    resolve6("templates"),
    resolve6("node_modules/@hatago/templates"),
    resolve6(__dirname2, "../../../templates"),
    resolve6(__dirname2, "../../../../templates")
  ];
  for (const path of possiblePaths) {
    if (existsSync5(path)) {
      return path;
    }
  }
  throw new CLIError("Templates directory not found", 1);
}
async function listTemplates(options) {
  const templatesDir = getTemplatesDir2();
  const engine = new TemplateEngine2();
  const templates = engine.listTemplates(templatesDir);
  if (process.env.HATAGO_JSON_OUTPUT === "true") {
    outputResult6({ templates });
    return;
  }
  console.log(`\\n\u{1F4DA} ${cyan7("Available Templates")}`);
  console.log("=".repeat(50));
  if (templates.length === 0) {
    console.log(`${yellow8("No templates found")}`);
    return;
  }
  const categories = /* @__PURE__ */ new Map();
  for (const template of templates) {
    const category = template.category || "other";
    if (!categories.has(category)) {
      categories.set(category, []);
    }
    categories.get(category).push(template);
  }
  const categoriesToShow = options.category ? [options.category] : Array.from(categories.keys()).sort();
  for (const category of categoriesToShow) {
    const categoryTemplates = categories.get(category);
    if (!categoryTemplates || categoryTemplates.length === 0) {
      continue;
    }
    console.log(`\\n${blue5(`${category.toUpperCase()}:`)}`);
    for (const template of categoryTemplates) {
      const tags = template.tags?.length ? ` (${template.tags.join(", ")})` : "";
      console.log(`  ${green6("\u2022")} ${template.name}${tags}`);
      console.log(`    ${gray3(template.description)}`);
    }
  }
  console.log(`\\n\u{1F4A1} Use ${cyan7("hatago scaffold --info <template>")} for detailed information`);
  console.log(`\u{1F4A1} Use ${cyan7("hatago scaffold <template> <name>")} to generate from template`);
}
async function showTemplateInfo(templateName) {
  const templatesDir = getTemplatesDir2();
  const engine = new TemplateEngine2();
  const templateDir = engine.findTemplate(templatesDir, templateName);
  if (!templateDir) {
    throw new CLIError(`Template not found: ${templateName}`, 1);
  }
  const config = engine.loadTemplateConfig(templateDir);
  const validation = engine.validateTemplate(templateDir);
  if (process.env.HATAGO_JSON_OUTPUT === "true") {
    outputResult6({
      config,
      validation,
      templateDir
    });
    return;
  }
  console.log(`\\n\u{1F4CB} ${cyan7("Template Information")}`);
  console.log("=".repeat(50));
  console.log(`Name: ${blue5(config.displayName)}`);
  console.log(`ID: ${config.name}`);
  console.log(`Category: ${config.category}`);
  console.log(`Version: ${config.version}`);
  console.log(`Author: ${config.author}`);
  console.log(`Description: ${config.description}`);
  if (config.tags?.length) {
    console.log(`Tags: ${config.tags.join(", ")}`);
  }
  console.log(`\\n\u{1F4C1} Files:`);
  for (const file of config.files) {
    const optional = file.optional ? gray3(" (optional)") : "";
    console.log(`  ${green6("\u2022")} ${file.output}${optional}`);
    console.log(`    ${gray3(file.description)}`);
  }
  if (config.prompts?.length) {
    console.log(`\\n\u2753 Configuration:`);
    for (const prompt of config.prompts) {
      const required = prompt.required ? red7(" *") : "";
      console.log(`  ${green6("\u2022")} ${prompt.name}${required} (${prompt.type})`);
      console.log(`    ${gray3(prompt.message)}`);
    }
  }
  if (config.dependencies?.length) {
    console.log(`\\n\u{1F4E6} Dependencies:`);
    config.dependencies.forEach((dep) => console.log(`  ${green6("\u2022")} ${dep}`));
  }
  if (config.devDependencies?.length) {
    console.log(`\\n\u{1F527} Dev Dependencies:`);
    config.devDependencies.forEach((dep) => console.log(`  ${green6("\u2022")} ${dep}`));
  }
  console.log(`\\n\u2705 Validation: ${validation.valid ? green6("Valid") : red7("Invalid")}`);
  if (!validation.valid) {
    validation.errors.forEach((error) => console.log(`  ${red7("\u2022")} ${error}`));
  }
  console.log(`\\n\u{1F4A1} Usage: ${cyan7(`hatago scaffold ${templateName} <name>`)}`);
}
async function interactivePrompt2(prompts) {
  const context = {};
  const { createInterface } = __require("readline");
  for (const prompt of prompts) {
    if (prompt.when && !context[prompt.when]) {
      continue;
    }
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    try {
      switch (prompt.type) {
        case "input":
          const defaultText = prompt.default ? ` (${prompt.default})` : "";
          const answer = await new Promise((resolve7) => {
            rl.question(`${prompt.message}${defaultText}: `, resolve7);
          });
          context[prompt.name] = answer.trim() || prompt.default || "";
          break;
        case "confirm":
          const defaultConfirm = prompt.default ? "Y/n" : "y/N";
          const confirmAnswer = await new Promise((resolve7) => {
            rl.question(`${prompt.message} (${defaultConfirm}): `, resolve7);
          });
          const isYes = confirmAnswer.toLowerCase() === "y" || confirmAnswer.toLowerCase() === "yes" || confirmAnswer === "" && prompt.default;
          context[prompt.name] = isYes;
          break;
        case "select":
          if (prompt.choices) {
            console.log(`\\n${prompt.message}`);
            prompt.choices.forEach((choice, index) => {
              console.log(`  ${index + 1}. ${choice}`);
            });
            const selectAnswer = await new Promise((resolve7) => {
              rl.question("Select option: ", resolve7);
            });
            const selectedIndex = parseInt(selectAnswer, 10) - 1;
            context[prompt.name] = prompt.choices[selectedIndex] || prompt.choices[0];
          }
          break;
        default:
          console.log(`${yellow8("Warning:")} Unsupported prompt type: ${prompt.type}`);
          context[prompt.name] = prompt.default;
      }
    } finally {
      rl.close();
    }
  }
  return context;
}
async function handleScaffold(templateName, outputName, options = {}) {
  try {
    if (options.list) {
      return await listTemplates(options);
    }
    if (options.info && templateName) {
      return await showTemplateInfo(templateName);
    }
    if (!templateName) {
      return await listTemplates(options);
    }
    if (!outputName) {
      throw new CLIError("Output name is required when generating from template", 1);
    }
    const templatesDir = getTemplatesDir2();
    const engine = new TemplateEngine2();
    if (process.env.HATAGO_JSON_OUTPUT === "true") {
      outputResult6({
        action: "scaffold",
        template: templateName,
        output: outputName,
        templatesDir,
        options
      });
      return;
    }
    console.log(`\\n\u{1F3D7}\uFE0F  ${cyan7("Scaffolding from Template")}`);
    console.log("=".repeat(40));
    const templateDir = engine.findTemplate(templatesDir, templateName);
    if (!templateDir) {
      throw new CLIError(`Template not found: ${templateName}`, 1);
    }
    const validation = engine.validateTemplate(templateDir);
    if (!validation.valid) {
      throw new CLIError(`Invalid template: ${validation.errors.join(", ")}`, 1);
    }
    const config = engine.loadTemplateConfig(templateDir);
    console.log(`\u{1F4CB} Template: ${blue5(config.displayName)}`);
    console.log(`\u{1F4DD} Output: ${outputName}`);
    const outputDir = resolve6(options.output || ".");
    console.log(`\u{1F4C2} Directory: ${outputDir}`);
    const outputPath = join4(outputDir, outputName);
    if (existsSync5(outputPath) && !options.force) {
      throw new CLIError(
        `Output already exists: ${outputPath}\\nUse --force to overwrite`,
        1
      );
    }
    let context = {
      name: outputName,
      version: "1.0.0",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      author: "Anonymous",
      description: `Generated ${outputName}`
    };
    if (options.context && existsSync5(options.context)) {
      try {
        const contextFile = __require("fs").readFileSync(options.context, "utf-8");
        const fileContext = JSON.parse(contextFile);
        context = { ...context, ...fileContext };
      } catch (error) {
        console.log(`${yellow8("Warning:")} Failed to load context file: ${error}`);
      }
    }
    if (options.interactive && config.prompts?.length) {
      console.log(`\\n\u{1F527} ${yellow8("Interactive Configuration")}`);
      const userContext = await interactivePrompt2(config.prompts);
      context = { ...context, ...userContext };
    }
    console.log(`\\n\u{1F528} ${yellow8("Generating files...")}`);
    const result = engine.generateFromTemplate(templateDir, outputDir, context, {
      includeOptional: true,
      dryRun: options.dry
    });
    if (options.dry) {
      console.log(`\\n${yellow8("\u{1F4CB}")} Dry run - files not created:`);
      result.files.forEach((file) => {
        console.log(`   ${gray3("\u2022")} ${file.path}`);
      });
    } else {
      console.log(`\\n${green6("\u2705")} Generated successfully:`);
      result.files.forEach((file) => {
        console.log(`   ${green6("\u2713")} ${file.path}`);
      });
      console.log(`\\n\u{1F3AF} Next steps:`);
      console.log(`   1. Review generated files in: ${outputPath}`);
      if (config.dependencies?.length) {
        console.log(`   2. Install dependencies: pnpm install ${config.dependencies.join(" ")}`);
      }
      if (config.category === "plugins") {
        console.log(`   3. Register plugin in your Hatago server`);
        console.log(`   4. Start development server: hatago dev`);
      }
    }
  } catch (error) {
    if (error instanceof CLIError) {
      throw error;
    }
    throw new CLIError(`Scaffolding failed: ${error}`, 1);
  }
}
var scaffoldCommand = new Command6("scaffold").description("Generate code from templates").argument("[template]", "Template name to use").argument("[name]", "Name for the generated output").option("-t, --template <name>", "Template name (alternative to positional argument)").option("-o, --output <dir>", "Output directory", ".").option("-c, --category <category>", "Filter templates by category").option("-l, --list", "List available templates").option("--info", "Show detailed template information").option("-i, --interactive", "Interactive configuration mode").option("--context <file>", "Load context from JSON file").option("--dry", "Show what would be generated without creating files").option("-f, --force", "Overwrite existing files").action(handleScaffold);
scaffoldCommand.on("--help", () => {
  console.log(`
Examples:
  # List all templates
  hatago scaffold --list
  
  # List templates by category
  hatago scaffold --list --category plugins
  
  # Show template information
  hatago scaffold --info basic
  
  # Generate from template
  hatago scaffold basic my-plugin
  
  # Interactive mode
  hatago scaffold basic my-plugin --interactive
  
  # Custom output directory
  hatago scaffold basic my-plugin --output ./plugins
  
  # Use context file
  hatago scaffold basic my-plugin --context ./config.json
  
  # Dry run to preview
  hatago scaffold basic my-plugin --dry
`);
});

// src/index.ts
setupErrorHandling();
var __dirname = dirname4(fileURLToPath3(import.meta.url));
var packagePath = join5(__dirname, "../package.json");
var packageInfo = JSON.parse(readFileSync2(packagePath, "utf-8"));
var program = new Command7();
program.name("hatago").description("Command line interface for Hatago MCP server").version(packageInfo.version).option("-v, --verbose", "Enable verbose output").option("--json", "Output in JSON format");
program.addCommand(configCommand);
program.addCommand(initCommand);
program.addCommand(devCommand);
program.addCommand(addServerCommand);
program.addCommand(createPluginCommand);
program.addCommand(scaffoldCommand);
program.hook("preAction", (thisCommand) => {
  const opts = thisCommand.optsWithGlobals();
  if (opts.verbose) {
    process.env.HATAGO_VERBOSE = "true";
  }
  if (opts.json) {
    process.env.HATAGO_JSON_OUTPUT = "true";
  }
});
if (process.env.NODE_ENV !== "test") {
  checkForUpdates(packageInfo.name, packageInfo.version);
}
program.parse();
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
//# sourceMappingURL=index.js.map