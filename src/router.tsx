import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import { AppShell } from './components/AppShell';
import { FactoryProvider } from './data/store';
import { ApplicationsPage } from './routes/ApplicationsPage';
import { BatchTracePage } from './routes/BatchTracePage';
import { KnowledgeDepsPage } from './routes/KnowledgeDepsPage';
import { StandardsReviewPage } from './routes/StandardsReviewPage';

const rootRoute = createRootRoute({
  component: () => (
    <FactoryProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </FactoryProvider>
  ),
});

const applicationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: ApplicationsPage,
});

const batchTraceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trace',
  component: BatchTracePage,
});

const knowledgeDepsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/knowledge',
  component: KnowledgeDepsPage,
});

const standardsReviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/standards',
  component: StandardsReviewPage,
});

// Legacy path redirects so bookmarked URLs land gracefully on the 4-view structure
const legacyRunsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/runs',
  beforeLoad: () => {
    throw redirect({ to: '/trace' });
  },
});

const legacyRunDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/runs/$unitId',
  beforeLoad: () => {
    throw redirect({ to: '/' });
  },
});

const legacyCampaignsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/campaigns',
  beforeLoad: () => {
    throw redirect({ to: '/knowledge' });
  },
});

const legacyInboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/inbox',
  beforeLoad: () => {
    throw redirect({ to: '/standards' });
  },
});

const routeTree = rootRoute.addChildren([
  applicationsRoute,
  batchTraceRoute,
  knowledgeDepsRoute,
  standardsReviewRoute,
  legacyRunsRoute,
  legacyRunDetailRoute,
  legacyCampaignsRoute,
  legacyInboxRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
