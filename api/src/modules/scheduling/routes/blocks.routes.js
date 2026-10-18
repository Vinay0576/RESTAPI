import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'scheduling.blocks',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.blocks);
  },
};
