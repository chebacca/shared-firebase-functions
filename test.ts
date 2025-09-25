import { setCorsHeaders } from './src/shared/utils';

const req = { headers: { origin: 'http://localhost:3000' } };
const res = { set: () => {} };

setCorsHeaders(req, res);
