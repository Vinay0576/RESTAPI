import {createFleetController} from './fleet.controller.js';
import machinesRoutes from './routes/machines.routes.js';
import machineSpecOverridesRoutes from './routes/machine-spec-overrides.routes.js';
import machinePhotosRoutes from './routes/machine-photos.routes.js';
import machineRateVersionsRoutes from './routes/machine-rate-versions.routes.js';
import attachmentStockRoutes from './routes/attachment-stock.routes.js';
import attachmentUnitsRoutes from './routes/attachment-units.routes.js';
import attachmentRateVersionsRoutes from './routes/attachment-rate-versions.routes.js';
import includedAttachmentsRoutes from './routes/included-attachments.routes.js';
import onboardingRuleVersionsRoutes from './routes/onboarding-rule-versions.routes.js';

export default {
  domain: 'fleet',
  createController: createFleetController,
  routes: [
    machinesRoutes,
    machineSpecOverridesRoutes,
    machinePhotosRoutes,
    machineRateVersionsRoutes,
    attachmentStockRoutes,
    attachmentUnitsRoutes,
    attachmentRateVersionsRoutes,
    includedAttachmentsRoutes,
    onboardingRuleVersionsRoutes,
  ],
};
