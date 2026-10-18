export class ApiError extends Error {
  constructor(status,code,message,details) { super(message); Object.assign(this,{status,code,details}); }
}
export function normalizeError(err) {
  if(err instanceof ApiError) return err;
  if(err.validation) return new ApiError(422,'VALIDATION_FAILED','Request failed validation.',
    err.validation.map(e=>({path:e.instancePath,keyword:e.keyword,message:e.message})));
  const mapped={
    '23505':[409,'DUPLICATE_RECORD','A record with this unique key already exists.'],
    '23503':[409,'REFERENCE_CONFLICT','A referenced record is missing or a dependent record prevents this change.'],
    '23502':[422,'REQUIRED_FIELD','A required database field is missing.'],
    '23514':[422,'DATABASE_RULE','The operation violates a model constraint or workflow guard.'],
    '23P01':[409,'RESERVATION_CONFLICT','The resource is already reserved for an overlapping period.'],
    '40001':[409,'RETRY_TRANSACTION','Concurrent changes require retrying the entire transaction.'],
    '40P01':[409,'RETRY_TRANSACTION','A database deadlock requires retrying the entire transaction.'],
    '55P03':[409,'RESOURCE_BUSY','Resource is busy; retry later.'],
    '57014':[503,'QUERY_TIMEOUT','Database query exceeded its time limit.'],
    '42501':[403,'DATABASE_PERMISSION_DENIED','Database permissions do not allow this operation.'],
    'ECONNREFUSED':[503,'DATABASE_UNAVAILABLE','Database is unavailable.'],
    '57P01':[503,'DATABASE_UNAVAILABLE','Database is restarting.']};
  if(mapped[err.code]) return new ApiError(...mapped[err.code],err.constraint?{constraint:err.constraint}:undefined);
  if(err.code?.startsWith('22')) return new ApiError(422,'INVALID_DATABASE_VALUE','A value is invalid for its database type.');
  if(err.statusCode && err.statusCode<500) return new ApiError(err.statusCode,err.statusCode===429?'RATE_LIMITED':'INVALID_REQUEST',err.statusCode===429?'Too many requests. Retry later.':'Request could not be accepted.');
  return new ApiError(500,'INTERNAL_ERROR','An unexpected error occurred.');
}
