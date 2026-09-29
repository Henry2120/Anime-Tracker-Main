import { ViolinPoseVariant } from '../types';

export const Variant00Neutral: ViolinPoseVariant = {
  id: 0,
  numberStr: '00',
  name: 'Neutral T-Pose Baseline',
  poseMethod: 'Authored Rest Configuration',
  referenceName: 'test.vrm Native T-Pose Rest State',
  referenceUrl: 'https://vrm.dev/en/univrm/humanoid/',
  creator: 'VRM Consortium Standard',
  license: 'CC0 / Standard Neutral Baseline',
  sourceAssetBundled: true,
  shortDescription: 'Unmodified pristine T-pose of test.vrm. Serves as the neutral anatomic reference control.',
  visibleDifferences: 'All joints unrotated. Arms outstretched straight along ±X axis. Instruments hidden.',
  applyPose: (vrm, violin, bow) => {
    violin.visible = false;
    bow.visible = false;
    return {};
  },
};
