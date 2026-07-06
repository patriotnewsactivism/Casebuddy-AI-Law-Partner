/**
 * IntakeHub — one place for everything client-intake.
 * Combines the Intake Inbox (leads, invite links, funnel) with Maya's live
 * voice intake under a single sidebar entry.
 */

import React from 'react';
import { Inbox, Mic } from 'lucide-react';
import HubTabs from './HubTabs';

const IntakeInbox = React.lazy(() => import('./IntakeInbox'));
const IntakePage  = React.lazy(() => import('./IntakePage'));

const IntakeHub: React.FC = () => (
  <HubTabs
    tabs={[
      { id: 'inbox', label: 'Intake Inbox', icon: <Inbox size={15} />, render: () => <IntakeInbox /> },
      { id: 'maya',  label: 'Maya Live Intake', icon: <Mic size={15} />, badge: 'Voice', render: () => <IntakePage /> },
    ]}
  />
);

export default IntakeHub;
