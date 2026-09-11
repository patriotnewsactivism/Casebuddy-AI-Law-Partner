import intakeRecordingPlaybackHandler from '../../api/intake/recording-playback';
import { adaptFetchHandler } from './_fetch-handler-adapter';

export const handler = adaptFetchHandler(intakeRecordingPlaybackHandler);
