import intakeRecordingUploadHandler from '../../api/intake/recording-upload';
import { adaptFetchHandler } from './_fetch-handler-adapter';

export const handler = adaptFetchHandler(intakeRecordingUploadHandler);
