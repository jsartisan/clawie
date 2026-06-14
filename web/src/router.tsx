import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';

import { AppShell } from './components/AppShell';
import { Agents } from './pages/Agents';
import { AgentLayout } from './pages/AgentLayout';
import { AgentSettings } from './pages/AgentSettings';
import { Approvals } from './pages/Approvals';
import { Chat } from './pages/Chat';
import { ResourcePage } from './pages/ResourcePage';
import { Routines } from './pages/Routines';
import { ConnectChannel } from './flows/ConnectChannel';
import { CreateAgent } from './flows/CreateAgent';

const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

// Agents are the only top-level destination — everything else lives inside one.
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Agents });
const createAgentRoute = createRoute({ getParentRoute: () => rootRoute, path: '/agents/new', component: CreateAgent });

const agentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agents/$groupId',
  component: AgentLayout,
});
const agentIndexRoute = createRoute({
  getParentRoute: () => agentRoute,
  path: '/',
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/agents/$groupId/chat', params, replace: true });
  },
});
const agentChatRoute = createRoute({ getParentRoute: () => agentRoute, path: 'chat', component: Chat });
const agentRoutinesRoute = createRoute({ getParentRoute: () => agentRoute, path: 'routines', component: Routines });
const agentApprovalsRoute = createRoute({ getParentRoute: () => agentRoute, path: 'approvals', component: Approvals });
const agentSettingsRoute = createRoute({ getParentRoute: () => agentRoute, path: 'settings', component: AgentSettings });
const agentConnectRoute = createRoute({
  getParentRoute: () => agentRoute,
  path: 'connect',
  component: ConnectChannel,
  validateSearch: (search: Record<string, unknown>): { channel?: string } => ({
    channel: typeof search.channel === 'string' ? search.channel : undefined,
  }),
});

// Legacy entry points from the sidebar era.
const agentsRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agents',
  beforeLoad: () => {
    throw redirect({ to: '/', replace: true });
  },
});
const chatRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/chat/$groupId',
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/agents/$groupId/chat', params, replace: true });
  },
});

const resourceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/r/$plural',
  component: ResourcePage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  createAgentRoute,
  agentRoute.addChildren([
    agentIndexRoute,
    agentChatRoute,
    agentRoutinesRoute,
    agentApprovalsRoute,
    agentSettingsRoute,
    agentConnectRoute,
  ]),
  agentsRedirectRoute,
  chatRedirectRoute,
  resourceRoute,
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
