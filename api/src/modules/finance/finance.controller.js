import {createModuleController} from '../../http/resource-controller.js';
import {ApiError} from '../../errors.js';

export function createFinanceController({resources, service, db}) {
  return {
    ...createModuleController('finance', resources, service),
    async bookingBalances(request) {
      const limit = Number(request.query.limit ?? 25), offset = Number(request.query.offset ?? 0);
      if (limit < 1 || limit > 100 || offset > 100000) {
        throw new ApiError(422, 'INVALID_PAGE', 'limit must be 1..100 and offset 0..100000.');
      }
      const result = await db.transaction(client => client.query(
        'select * from finance.booking_balances where ($1::uuid is null or booking_id=$1) order by booking_id limit $2 offset $3',
        [request.query.booking_id ?? null, limit, offset],
      ), {readOnly: true});
      return {data: result.rows, page: {limit, offset}, meta: {requestId: request.id}};
    },
  };
}
