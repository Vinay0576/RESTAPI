import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'catalogue.manufacturer_aliases',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.manufacturer_aliases);
  },
};
