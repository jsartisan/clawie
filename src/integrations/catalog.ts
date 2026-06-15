/**
 * Curated integration catalog — the "app store" entries the portal shows.
 *
 * Each entry maps to an MCP server package that gets installed into the
 * agent's container image (packages_npm → `pnpm install -g` at image build)
 * and wired via the mcp_servers container config. API keys ride in the MCP
 * server's env, same as the existing add_mcp_server self-mod flow.
 *
 * Entries with `auth.type = 'guided'` can't be one-click enabled (OAuth
 * dances, hosted broker pending) — the portal shows them with instructions
 * to run the matching install skill instead.
 */

export interface IntegrationAuth {
  type: 'api_key' | 'none' | 'guided';
  /** Env var the MCP server reads the key from (api_key only). */
  env?: string;
  /** Env var for a secondary URL field (e.g. GRAFANA_URL). */
  urlEnv?: string;
  /** Where the user gets a key, e.g. "https://brave.com/search/api". */
  helpUrl?: string;
  /** One-line plain-language instruction for getting the key. */
  help?: string;
}

/**
 * When present, the API key is stored in the OneCLI vault instead of the
 * container env. The host extracts the hostname from the user-provided URL,
 * creates a secret with the given injection config, and assigns it to the
 * agent. The secret id is persisted so disable can clean it up.
 */
export interface OneCLISecretConfig {
  /** Vault display-name prefix (group name appended at runtime). */
  namePrefix: string;
  /** HTTP header the secret rides in (e.g. 'Authorization'). */
  headerName: string;
  /** Value template (default: '{value}'). */
  valueFormat?: string;
}

export interface IntegrationDef {
  id: string;
  name: string;
  description: string;
  category: 'search' | 'productivity' | 'developer' | 'knowledge';
  auth: IntegrationAuth;
  /** npm package installed globally into the agent image. */
  npmPackage?: string;
  /** MCP server wiring (binary exposed by the npm package). */
  mcp?: { name: string; command: string; args: string[] };
  /**
   * When set, the API key is registered in the OneCLI vault rather than
   * written to the container env. The host pattern is derived from the URL
   * the user provides (auth.urlEnv must also be set).
   */
  onecliSecret?: OneCLISecretConfig;
}

export const INTEGRATION_CATALOG: IntegrationDef[] = [
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Let your agent search the web and read current information.',
    category: 'search',
    auth: {
      type: 'api_key',
      env: 'BRAVE_API_KEY',
      helpUrl: 'https://brave.com/search/api/',
      help: 'Sign up for the Brave Search API (free tier available) and copy your API key.',
    },
    npmPackage: '@modelcontextprotocol/server-brave-search',
    mcp: { name: 'brave-search', command: 'mcp-server-brave-search', args: [] },
  },
  {
    id: 'tavily',
    name: 'Tavily',
    description: 'Web search and page extraction built for AI agents.',
    category: 'search',
    auth: {
      type: 'api_key',
      env: 'TAVILY_API_KEY',
      helpUrl: 'https://app.tavily.com',
      help: 'Create a free Tavily account and copy the API key from your dashboard.',
    },
    npmPackage: 'tavily-mcp',
    mcp: { name: 'tavily', command: 'tavily-mcp', args: [] },
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    description: 'Turn any website into clean text your agent can read and summarize.',
    category: 'knowledge',
    auth: {
      type: 'api_key',
      env: 'FIRECRAWL_API_KEY',
      helpUrl: 'https://firecrawl.dev',
      help: 'Create a Firecrawl account and copy your API key.',
    },
    npmPackage: 'firecrawl-mcp',
    mcp: { name: 'firecrawl', command: 'firecrawl-mcp', args: [] },
  },
  {
    id: 'context7',
    name: 'Context7 Docs',
    description: 'Up-to-date documentation for thousands of libraries and frameworks.',
    category: 'developer',
    auth: { type: 'none' },
    npmPackage: '@upstash/context7-mcp',
    mcp: { name: 'context7', command: 'context7-mcp', args: [] },
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Read repos, issues, and pull requests; create issues and comments.',
    category: 'developer',
    auth: {
      type: 'api_key',
      env: 'GITHUB_PERSONAL_ACCESS_TOKEN',
      helpUrl: 'https://github.com/settings/tokens',
      help: 'Create a personal access token (classic) with the repo scope.',
    },
    npmPackage: '@modelcontextprotocol/server-github',
    mcp: { name: 'github', command: 'mcp-server-github', args: [] },
  },
  {
    id: 'grafana',
    name: 'Grafana',
    description: 'Query Loki logs, explore dashboards, and search datasources in your Grafana instance.',
    category: 'developer',
    auth: {
      type: 'api_key',
      env: 'GRAFANA_SERVICE_ACCOUNT_TOKEN',
      urlEnv: 'GRAFANA_URL',
      helpUrl: 'https://grafana.com/docs/grafana/latest/administration/service-accounts/',
      help: 'For Grafana Cloud Loki: paste base64(userID:token) — run: echo -n "USERID:TOKEN" | base64. For self-hosted Grafana: paste your service account token directly.',
    },
    npmPackage: '@leval/mcp-grafana',
    mcp: { name: 'grafana', command: 'mcp-grafana', args: [] },
    onecliSecret: {
      namePrefix: 'Grafana',
      headerName: 'Authorization',
      valueFormat: 'Basic {value}',
    },
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Read, search, and send email from your agent.',
    category: 'productivity',
    auth: {
      type: 'guided',
      help: 'Google OAuth needs a guided setup — ask your install assistant to run /add-gmail-tool.',
    },
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Check your schedule, find free slots, and create events.',
    category: 'productivity',
    auth: {
      type: 'guided',
      help: 'Google OAuth needs a guided setup — ask your install assistant to run /add-gcal-tool.',
    },
  },
];

export function getIntegration(id: string): IntegrationDef | undefined {
  return INTEGRATION_CATALOG.find((i) => i.id === id);
}
