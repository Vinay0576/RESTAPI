import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'rentals.party_snapshots',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.party_snapshots);
  },
};
