import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'logistics.tariff_versions',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.tariff_versions);
  },
};
