import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'finance.ledger_accounts',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.ledger_accounts);
  },
};
