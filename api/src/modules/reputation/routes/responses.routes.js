import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'reputation.responses',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.responses);
  },
};
