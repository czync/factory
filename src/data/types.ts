export type ThemeMode = 'light' | 'dark';

export type AppScope = 'ALL' | 'MINE';

export type InspectorTab = 'trace' | 'knowledge' | 'deps' | 'commands';

export type Disposition = 'As-Is' | 'Modernize' | 'Retire';

export type WaveId = 'W0' | 'W1' | 'W2' | 'W3' | 'W4';

export type RiskLevel = 'HIGH' | 'WATCH' | 'ON_TRACK';

export type StageId =
  | 'Intake'
  | 'Discovery'
  | 'WP-00'
  | 'Spec'
  | 'Build'
  | 'Verify'
  | 'ProdParallel'
  | 'Cutover'
  | 'Decommission';

export const STAGE_ORDER: readonly StageId[] = [
  'Intake',
  'Discovery',
  'WP-00',
  'Spec',
  'Build',
  'Verify',
  'ProdParallel',
  'Cutover',
  'Decommission',
] as const;

export const STAGE_LABELS: Record<StageId, string> = {
  Intake: '立项 Intake',
  Discovery: '发现 Discovery',
  'WP-00': 'WP-00 基线',
  Spec: '规格 Spec',
  Build: '改造 Build',
  Verify: '验证 Verify',
  ProdParallel: '生产并行',
  Cutover: '切换 Cutover',
  Decommission: '下线退役',
};

export type WorkPackageCode =
  | 'WP-00'
  | 'WP-01'
  | 'WP-02'
  | 'WP-03'
  | 'WP-04'
  | 'WP-05'
  | 'WP-06'
  | 'WP-07';

export const WP_LABELS: Record<WorkPackageCode, string> = {
  'WP-00': '黄金基线与双跑比对',
  'WP-01': '密钥托管 (Vault / CyberArk)',
  'WP-02': 'CI/CD 接入 (Harness)',
  'WP-03': '容器化 / VM (ECS · EKS · TFE)',
  'WP-04': '统一文件传输 (Transfer / MFX)',
  'WP-05': '统一作业调度 (AutoSys JIL)',
  'WP-06': '数据库换型 (Sybase → Oracle)',
  'WP-07': '操作系统迁移 (Solaris/Win → Linux)',
};

export type AiExecutorKind =
  | 'Copilot Squad'
  | 'Blitzy (Blackbox)'
  | 'Deterministic Script'
  | 'Manual';

export const CURRENT_ENGINEER = {
  handle: 'm.zhou',
  name: '周明 (M. Zhou)',
  email: 'm.zhou@custody.internal',
  role: '迁移架构 Tech Lead',
  squad: 'Custody Migration Squad A',
} as const;

export const PROGRAM_TOTALS = {
  totalApps: 78,
  asIsApps: 58,
  modernizeApps: 8,
  retireApps: 12,
  latestAgentKitVersion: 'v1.4.0',
  centralKnowledgeRepo: 'git@ghe.custody.internal:migration/migration-knowledge.git',
  artifactoryRegistry: 'https://artifactory.custody.internal/artifactory/api/npm/mig-agent-kit/',
  agentCoreRegion: 'ap-southeast-1 (VPC PrivateLink)',
  agentCoreGatewayEndpoint: 'mcp://agentcore-gw.custody.internal/v1',
} as const;

export interface WaveRecord {
  id: WaveId;
  milestone: string;
  targetMonth: string;
  title: string;
  totalAppsInProgram: number;
  status: 'ACTIVE' | 'PREPARING' | 'PEAK_RISK' | 'SCHEDULED';
  dbTablesCount: number;
  dbTablesReady: number;
  batchChangeReady: boolean;
  note: string;
}

export interface AgentCoreFinding {
  reviewer: 'Blast-Radius' | 'Migration-Semantics' | 'Contract & Blitzy-Gate';
  severity: 'BLOCK' | 'WARN' | 'PASS';
  summary: string;
  graphImpactNodes?: number;
}

export interface AgentCorePrReview {
  sessionId: string;
  runtime: 'AgentCore Runtime (MicroVM)';
  bedrockModel: string;
  cedarPolicy: 'READ_ONLY_PR_COMMENT';
  verdict: 'PASS' | 'CHANGES_REQUESTED' | 'RUNNING';
  durationSec: number;
  gatewayToolsUsed: string[];
  findings: AgentCoreFinding[];
  reviewedAt: string;
}

export interface AgentCoreGatewayTool {
  id: string;
  name: string;
  source: string;
  consumers: readonly ('AgentCore Reviewer' | 'Copilot Squad IDE' | 'Blitzy Spec Export')[];
  cedarAccess: 'READ_ONLY';
  calls24h: number;
  p95Ms: number;
  status: 'HEALTHY' | 'DEGRADED';
  description: string;
}

export interface TracePrItem {
  prNumber: string;
  title: string;
  branch: string;
  jiraKey: string;
  jiraStatus: 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'DONE';
  jiraWorkLogSynced: boolean;
  wpCode: WorkPackageCode;
  aiExecutor: AiExecutorKind;
  aiModel: string;
  agentKitVersion: string;
  commitTrailerComplete: boolean;
  lintPassed: boolean;
  schemaPassed: boolean;
  wp00Passed: boolean;
  independentReview: boolean;
  reviewState: 'APPROVED' | 'CHANGES_REQUESTED' | 'PENDING' | 'MERGED';
  dirtyFilesCount: number;
  updatedAt: string;
  failingCheckSummary?: string;
  url: string;
  autoReview?: AgentCorePrReview;
}

export interface KnowledgeStatus {
  openwikiStatus: 'FRESH' | 'STALE' | 'MISSING';
  staleClaimsCount: number;
  totalClaimsCount: number;
  lastPrSynced: string;
  syncTrigger: 'PR_READY' | 'PR_MERGE' | 'LOCAL_SYNC';
  dispatchRuntime?: 'AgentCore Runtime (Bedrock)' | 'Local Copilot CLI';
  graphifyStatus: 'INDEXED' | 'PARTIAL_LEGACY' | 'MISSING';
  graphNodes: number;
  graphEdgesExtracted: number;
  graphEdgesInferred: number;
  graphEdgesAmbiguous: number;
  legacyCoverageNote: string;
  indexPreviewMd: string;
  graphReportPreviewMd: string;
  centralRepoPath: string;
  staleClaimFiles?: string[];
}

export interface VerificationRule {
  id: string;
  code: string;
  name: string;
  layer: 'LINT' | 'TYPE_SCHEMA' | 'LOCAL_VERIFY' | 'PR_CI';
  tool: string;
  wpScope: string;
  sourceCaseJira: string;
  intercepts30d: number;
  passRate: number;
  status: 'ENFORCED' | 'WARN' | 'NEW';
  description: string;
}

export interface AgentKitRelease {
  version: string;
  publishedAt: string;
  channel: 'Artifactory';
  adoptedApps: number;
  status: 'LATEST' | 'SUPPORTED' | 'DEPRECATED';
  highlights: string[];
  sourceAwareDriftCount: number;
}

export interface ReviewBotSpec {
  id: string;
  name:
    | 'Blast-Radius Bot'
    | 'Baseline-Guard Bot'
    | 'Compliance-Sicko Bot'
    | 'Jira-Logger Bot';
  permission: 'READ_ONLY' | 'RESTRICTED_JIRA_WRITE';
  runtime?: 'AgentCore MicroVM (Cloud)' | 'Local Copilot Squad' | 'Hybrid (Local + AgentCore)';
  cedarPolicy?: string;
  role: string;
  trigger: string;
  runs30d: number;
  catches30d: number;
  status: 'ACTIVE';
}

export interface BatchTraceRecord {
  id: string;
  unitId: string;
  unitCode: string;
  unitName: string;
  disposition: Disposition;
  wave: WaveId;
  owner: string;
  isMine: boolean;
  wpCode: WorkPackageCode;
  jiraKey: string;
  jiraSummary: string;
  pr: TracePrItem;
  localCommand: string;
}

export interface OnboardingStep {
  id: string;
  order: number;
  title: string;
  system: 'ServiceNow' | 'SailPoint' | 'EntraID' | 'TFE' | 'CyberArk' | 'Harness' | 'AWS';
  status: 'DONE' | 'WAITING_APPROVAL' | 'READY' | 'BLOCKED';
  ticketId?: string;
  waitDays: number;
  p90Days: number;
  bookmarkletPayload: string;
  derivedFields: Record<string, string>;
}

export interface OnboardingSummary {
  completedSteps: number;
  totalSteps: number;
  waitingTickets: number;
  maxWaitDays: number;
  p90Exceeded: boolean;
  nextActionLabel: string;
}

export interface DiffCluster {
  id: string;
  tableName: string;
  affectedRows: number;
  field: string;
  legacySample: string;
  awsSample: string;
  suspectedFile: string;
  suspectedDiff: string;
  rootCauseSummary: string;
  status: 'OPEN' | 'FIX_PR_CREATED' | 'SME_ACCEPTED';
}

export interface Wp00Baseline {
  status: 'NOT_STARTED' | 'CAPTURING' | 'SEALED' | 'DUAL_RUN_DIFF' | 'PARITY_VERIFIED';
  mode: 'AutoSys Batch' | 'Online / MQ' | 'Sybase Stored Proc' | 'N/A';
  reproducibleBuildOk: boolean;
  frozenDepsUri?: string;
  s3WormUri?: string;
  sha256?: string;
  sampleRows?: number;
  capturedAt?: string;
  legacyBuildMinutes: number;
  harnessBuildMinutes?: number;
  diffClusters: DiffCluster[];
}

export interface ReleaseSummary {
  branchState:
    | 'DEVELOP_ONLY'
    | 'RELEASE_PR_OPEN'
    | 'UAT_DEPLOYED'
    | 'PROD_RECONCILED'
    | 'MASTER_ARCHIVED';
  releasePrNumber?: string;
  changeTicketId?: string;
  artifactSha256?: string;
  uatSha256?: string;
  prodSha256?: string;
  sha256Reconciled: boolean;
  independentReviewOk: boolean;
  dirtyFilesCount: number;
  securityScanPass: boolean;
  tfeZeroDrift: boolean;
  harnessStatus: 'GREEN' | 'RUNNING' | 'FAILED' | 'IDLE';
}

export interface UnitLocalCommands {
  verify: string;
  wikiSync: string;
  graphExtract: string;
  kitUpgrade?: string;
}

export interface MigrationUnit {
  id: string;
  appId: string;
  code: string;
  name: string;
  domain: string;
  disposition: Disposition;
  wave: WaveId;
  owner: string;
  ownerHandle: string;
  isMine: boolean;
  techStack: string;
  locLabel: string;
  plannedStage: StageId;
  observedStage: StageId;
  controlledStage: StageId;
  observedActivity: string;
  riskLevel: RiskLevel;
  blockerSummary?: string;
  waitDays: number;
  targetCutover: string;
  agentKitVersion: string;
  agentKitOutdated: boolean;
  jiraKey: string;
  activePrs: TracePrItem[];
  wp00: Wp00Baseline;
  knowledge: KnowledgeStatus;
  onboardingSummary: OnboardingSummary;
  onboardingSteps: OnboardingStep[];
  releaseSummary: ReleaseSummary;
  localCommands: UnitLocalCommands;
}

export interface SharedTable {
  name: string;
  ownerAppId: string;
  ownerAppName: string;
  targetWave: WaveId | 'Wave-Unknown';
  status: 'SYBASE_PENDING' | 'DUAL_WRITE' | 'ORACLE_READY' | 'WAVE_UNKNOWN';
  readersCount: number;
  unregisteredReaders: number;
  lastAuditScanAt?: string;
  bridgeStrategy?: string;
}

export interface DependencyFact {
  id: string;
  unitId: string;
  targetName: string;
  kind: 'SYBASE_TABLE' | 'AUTOSYS_JOB' | 'FILE_TRANSFER' | 'MQ_QUEUE';
  source: 'CODE_STATIC' | 'DB_RUNTIME_LOG' | 'BOTH' | 'HUMAN_CONFIRMED';
  unregisteredImplicit: boolean;
  confirmed: boolean;
  targetWave?: WaveId | 'Wave-Unknown';
  dbAccount?: string;
  runtimeHits30d?: number;
  note?: string;
}

export interface SmeRuleItem {
  id: string;
  code: string;
  inputSpec: string;
  logicSpec: string;
  outputSpec: string;
  sourceRef: string;
  sourceSnippet: string;
  baselineExampleIn: string;
  baselineExampleOut: string;
  confidence: number;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  smeNote?: string;
}

export interface SmeRuleGroup {
  id: string;
  unitId: string;
  unitName: string;
  l1Domain: string;
  l2Flow: string;
  blitzyInputBound?: boolean;
  rules: SmeRuleItem[];
}

export interface DecisionQueueItem {
  id: string;
  kind: 'UNREGISTERED_DB' | 'WAIVER' | 'DIFF_SIGNOFF';
  unitId: string;
  unitCode: string;
  title: string;
  subtitle: string;
  severity: 'HIGH' | 'MEDIUM';
  createdAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  jiraKey?: string;
  evidence: {
    label: string;
    value: string;
  }[];
  detailText: string;
  relatedTableName?: string;
  relatedDepId?: string;
  relatedDiffClusterId?: string;
  decisionNote?: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  category: 'FACT' | 'DECISION' | 'EXECUTION';
  initiatorUser: string;
  executorType: 'HUMAN' | 'DETERMINISTIC_SCRIPT' | 'AGENT';
  agentMetadata?: {
    tool: string;
    model: string;
    onBehalfOf: string;
  };
  sourceType: 'CODE' | 'RUNTIME' | 'HUMAN_CONFIRMED' | 'AI_DRAFT' | 'EXTERNAL_WEBHOOK';
  unitId?: string;
  summary: string;
  payloadJson: string;
  prevEventHash: string;
  currentEventHash: string;
}

export interface ToastNotice {
  id: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
  title: string;
  detail?: string;
}
