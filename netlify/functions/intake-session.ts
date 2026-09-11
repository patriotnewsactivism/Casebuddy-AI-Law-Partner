import intakeSessionHandler from '../../api/intake/session';
import { adaptFetchHandler } from './_fetch-handler-adapter';

export const handler = adaptFetchHandler(intakeSessionHandler);
