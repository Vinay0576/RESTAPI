import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'finance.payee_profiles',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.payee_profiles);
  },
};
