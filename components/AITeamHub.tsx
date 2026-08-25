/**
 * AITeamHub — the unified CaseBuddy conversation surface.
 *
 * Ask CaseBuddy is the default front door: users describe the problem or work
 * they need and CaseBuddy routes it automatically. Specialist selection and
 * live voice remain available for users who want a narrower interaction.
 */

import React from 'react';
import { MessageSquare, PhoneCall, Sparkles } from 'lucide-react';
import HubTabs from './HubTabs';

const AskCaseBuddy  = React.lazy(() => import('./AskCaseBuddy'));
const LegalTeam     = React.lazy(() => import('./LegalTeam'));
const FirmReception = React.lazy(() => import('./FirmReception'));

const AITeamHub: React.FC = () => (
  <HubTabs
    tabs={[
      {
        id: 'ask',
        label: 'Ask CaseBuddy',
        icon: <Sparkles size={15} />,
        badge: 'Auto-route',
        render: () => <AskCaseBuddy />,
      },
      {
        id: 'specialists',
        label: 'Choose a Specialist',
        icon: <MessageSquare size={15} />,
        render: () => <LegalTeam />,
      },
      {
        id: 'voice',
        label: 'Voice',
        icon: <PhoneCall size={15} />,
        badge: 'Live',
        render: () => <FirmReception />,
      },
    ]}
  />
);

export default AITeamHub;
