import {createHash,timingSafeEqual} from 'node:crypto';
import {ApiError} from './errors.js';
const hash=s=>createHash('sha256').update(s).digest();
export function authHook(config) {
  const admin=hash(config.adminKey), read=hash(config.readKey);
  return async function authenticate(request) {
    if(request.routeOptions.config.public) return;
    const header=request.headers.authorization;
    if(typeof header!=='string'||!/^Bearer [^\s]+$/.test(header))
      throw new ApiError(401,'UNAUTHENTICATED','A Bearer API key is required.');
    const candidate=hash(header.slice(7));
    request.apiRole=timingSafeEqual(candidate,admin)?'admin':timingSafeEqual(candidate,read)?'reader':null;
    if(!request.apiRole) throw new ApiError(401,'UNAUTHENTICATED','Invalid API key.');
    if(!['GET','HEAD','OPTIONS'].includes(request.method) && request.apiRole!=='admin')
      throw new ApiError(403,'WRITE_FORBIDDEN','The read-only key cannot modify data.');
  };
}
