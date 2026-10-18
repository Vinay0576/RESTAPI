import {errors, listQuery} from '../../../http/schemas.js';

export default async function bookingBalancesRoutes(app, {controller}) {
  app.get('/v1/admin/finance/booking-balances', {
    schema: {
      tags: ['finance'],
      summary: 'Read the supplied derived booking balance view',
      description: 'Derived financial projection, not payout or release eligibility. Exact amounts remain strings.',
      querystring: {
        type: 'object',
        properties: {limit: listQuery.properties.limit, offset: listQuery.properties.offset, booking_id: {type: 'string', format: 'uuid'}},
        additionalProperties: false,
      },
      response: errors,
    },
  }, controller.bookingBalances);
}
