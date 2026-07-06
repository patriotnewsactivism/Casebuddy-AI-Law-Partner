/**
 * MediaStudio — one place for media-to-text.
 * Combines the audio/video/document Transcriber & OCR with TubeScribe
 * (YouTube transcription) under a single sidebar entry.
 */

import React from 'react';
import { FileAudio, Youtube } from 'lucide-react';
import HubTabs from './HubTabs';

const Transcriber = React.lazy(() => import('./Transcriber'));
const TubeScribe  = React.lazy(() => import('./TubeScribe'));

const MediaStudio: React.FC = () => (
  <HubTabs
    tabs={[
      { id: 'transcriber', label: 'Transcriber & OCR', icon: <FileAudio size={15} />, render: () => <Transcriber /> },
      { id: 'tubescribe',  label: 'TubeScribe', icon: <Youtube size={15} />, badge: 'YouTube', render: () => <TubeScribe /> },
    ]}
  />
);

export default MediaStudio;
