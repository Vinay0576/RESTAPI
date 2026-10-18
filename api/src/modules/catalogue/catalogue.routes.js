import {createCatalogueController} from './catalogue.controller.js';
import equipmentCategoriesRoutes from './routes/equipment-categories.routes.js';
import manufacturersRoutes from './routes/manufacturers.routes.js';
import manufacturerAliasesRoutes from './routes/manufacturer-aliases.routes.js';
import modelsRoutes from './routes/models.routes.js';
import variantsRoutes from './routes/variants.routes.js';
import attachmentCategoriesRoutes from './routes/attachment-categories.routes.js';
import attachmentsRoutes from './routes/attachments.routes.js';
import compatibilityRulesRoutes from './routes/compatibility-rules.routes.js';
import compatibilityPoliciesRoutes from './routes/compatibility-policies.routes.js';

export default {
  domain: 'catalogue',
  createController: createCatalogueController,
  routes: [
    equipmentCategoriesRoutes,
    manufacturersRoutes,
    manufacturerAliasesRoutes,
    modelsRoutes,
    variantsRoutes,
    attachmentCategoriesRoutes,
    attachmentsRoutes,
    compatibilityRulesRoutes,
    compatibilityPoliciesRoutes,
  ],
};
