import intakeRecordingRetentionHandler from '../../api/intake/recording-retention';
import { adaptFetchHandler } from './_fetch-handler-adapter';

export const handler = adaptFetchHandler(intakeRecordingRetentionHandler);
