/**
 * DiscoveryManager — canonical Discovery hub.
 *
 * Discovery is broader than discovery-request drafting. This shell keeps the
 * mature requests/responses workflow intact while adding the first
 * DiscoveryLens-derived evidence-intelligence surface behind the same matter,
 * authentication, storage, and tenancy model.
 */

import React from 'react';
import { FileSearch, SearchCheck } from 'lucide-react';
import HubTabs from './HubTabs';

const DiscoveryRequests = React.lazy(() => import('./DiscoveryRequests'));
const DiscoveryIntelligence = React.lazy(() => import('./DiscoveryIntelligence'));

const DiscoveryManager: React.FC = () => (
  <HubTabs
    tabs={[
      {
        id: 'intelligence',
        label: 'Evidence Intelligence',
        icon: <SearchCheck size={15} />,
        badge: 'Sourced',
        render: () => <DiscoveryIntelligence />,
      },
      {
        id: 'requests',
        label: 'Discovery Requests',
        icon: <FileSearch size={15} />,
        render: () => <DiscoveryRequests />,
      },
    ]}
  />
);

export default DiscoveryManager;
