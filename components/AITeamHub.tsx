/**
 * AITeamHub — one place to talk to your AI legal team.
 * Combines the attorney/paralegal chat (Legal Team) with the voice
 * reception line (Talk to the Firm) under a single sidebar entry.
 */

import React from 'react';
import { MessageSquare, PhoneCall } from 'lucide-react';
import HubTabs from './HubTabs';

const LegalTeam     = React.lazy(() => import('./LegalTeam'));
const FirmReception = React.lazy(() => import('./FirmReception'));

const AITeamHub: React.FC = () => (
  <HubTabs
    tabs={[
      { id: 'chat',  label: 'Chat with Attorneys', icon: <MessageSquare size={15} />, render: () => <LegalTeam /> },
      { id: 'voice', label: 'Voice Reception', icon: <PhoneCall size={15} />, badge: 'Live', render: () => <FirmReception /> },
    ]}
  />
);

export default AITeamHub;
