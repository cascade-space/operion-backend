import { Document, Types } from 'mongoose';

// Base interfaces
export interface BaseDocument extends Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// User Types
export type UserRole = 'super_admin' | 'factory_admin' | 'supervisor' | 'employee';

export interface IUserProfile {
  firstName: string;
  lastName: string;
  phone: string;
  avatar?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    zipCode?: string;
  };
}

export interface IUser extends BaseDocument {
  email: string;
  username?: string;
  password: string;
  role: UserRole;
  factoryId?: Types.ObjectId;
  supervisorId?: Types.ObjectId;
  profile: IUserProfile;
  deviceId?: string;
  isActive: boolean;
  lastLogin?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  emailVerified: boolean;
  emailVerificationToken?: string;
  emailVerificationExpires?: Date;
  
  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  generatePasswordResetToken(): string;
  generateEmailVerificationToken(): string;
}

// Factory Types
export interface IAddress {
  street: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
}

export interface IGeofence {
  latitude: number;
  longitude: number;
  radius: number;
}

export interface ISubscription {
  plan: 'basic' | 'pro' | 'enterprise';
  validUntil: Date;
  maxUsers: number;
  features?: string[];
}

export interface IShift {
  name: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

export interface IFactorySettings {
  timezone: string;
  workingHours: {
    start: string;
    end: string;
  };
  shifts: IShift[];
  geofencingEnabled: boolean;
  photoRequired: boolean;
  locationRequired: boolean;
}

export interface IFactoryMetadata {
  industry?: string;
  size?: string;
  established?: Date;
  description?: string;
  website?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export interface IFactory extends BaseDocument {
  name: string;
  address: IAddress;
  geofence: IGeofence;
  adminId: Types.ObjectId;
  adminEmail?: string;
  adminProfile?: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    address?: string;
  };
  adminCredentials?: {
    username?: string;
    password?: string;
  };
  rejectionReason?: string;
  subscription: ISubscription;
  status: 'pending' | 'approved' | 'suspended' | 'rejected';
  isActive: boolean;
  settings: IFactorySettings;
  metadata?: IFactoryMetadata;
  
  // Methods
  isSubscriptionActive(): boolean;
  canAddUser(currentUserCount: number): boolean;
  isWithinGeofence(latitude: number, longitude: number): boolean;
}

// Product Types
export interface IDimensions {
  length?: number;
  width?: number;
  height?: number;
  unit: 'mm' | 'cm' | 'm' | 'inch';
}

export interface IWeight {
  value?: number;
  unit: 'g' | 'kg' | 'lb';
}

export interface IProductSpecifications {
  dimensions?: IDimensions;
  weight?: IWeight;
  material?: string;
  color?: string;
  finish?: string;
}

export interface IPricing {
  cost?: number;
  sellingPrice?: number;
  currency: string;
}

export interface IInventory {
  currentStock: number;
  minStock: number;
  maxStock?: number;
  unit: string;
}

export interface IQuality {
  targetDefectRate: number;
  inspectionRequired: boolean;
  qualityStandards?: string[];
}

export interface IProductImage {
  url: string;
  caption?: string;
  isPrimary: boolean;
}

export interface IProductMetadata {
  sku?: string;
  barcode?: string;
  supplier?: string;
  leadTime?: number;
  notes?: string;
}

export interface IProduct extends BaseDocument {
  factoryId: Types.ObjectId;
  name: string;
  code: string;
  dailyTarget: number;
  processes?: Array<{
    processId: Types.ObjectId;
    order: number;
  }>;
}

// Process Types
export interface IInspectionPoint {
  name: string;
  description?: string;
  isRequired: boolean;
}

export interface IProcessQuality {
  inspectionPoints?: IInspectionPoint[];
  acceptableDefectRate: number;
  reworkAllowed: boolean;
  maxReworkAttempts: number;
}

export interface IProcessDependency {
  processId: Types.ObjectId;
  type: 'prerequisite' | 'parallel' | 'optional';
}

export interface IProcessSpecifications {
  duration?: number;
  complexity: 'low' | 'medium' | 'high';
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  tools?: string[];
  materials?: string[];
  instructions?: string[];
}

export interface IProcessMetrics {
  averageEfficiency: number;
  totalProduction: number;
  totalRejections: number;
  averageCycleTime: number;
}

export interface IProcessSettings {
  requiresPhoto: boolean;
  requiresLocation: boolean;
  autoValidation: boolean;
  supervisorApproval: boolean;
}

export interface IProcess extends BaseDocument {
  factoryId: Types.ObjectId;
  name: string;
  order: number;
  availableQuantity: number;
  isLocked: boolean;
  lockedAt?: Date;
  dailyTarget: number;
}


export interface IMachine extends BaseDocument {
  factoryId: Types.ObjectId;
  name: string;
}

// Attendance Types
export interface ILocation {
  latitude: number;
  longitude: number;
}

export interface ICheckIn {
  time: Date;
  location: ILocation;
  isWithinGeofence: boolean;
}

export interface ICheckOut {
  time: Date;
  location: ILocation;
}

export interface IAttendance extends BaseDocument {
  employeeId: Types.ObjectId;
  factoryId: Types.ObjectId;
  date: Date;
  checkIn: ICheckIn;
  checkOut?: ICheckOut;
  shiftType: 'morning' | 'evening' | 'night';
  processId: Types.ObjectId;
  target: number;
  status: 'present' | 'absent' | 'half-day';
  
  // Methods
  performCheckOut(time: Date, location: ILocation): Promise<IAttendance>;
  updateStatus(status: 'present' | 'absent' | 'half-day'): Promise<IAttendance>;
}

// Work Entry Types
export interface IWorkEntry extends BaseDocument {
  employeeId: Types.ObjectId;
  supervisorId?: Types.ObjectId;
  factoryId: Types.ObjectId;
  attendanceId?: Types.ObjectId;
  processId: Types.ObjectId;
  productId: Types.ObjectId;
  machineId?: Types.ObjectId;
  machineCode?: string;
  shiftType?: string;
  achieved: number;
  rejected: number;
  photo?: string;
  validationStatus: 'pending' | 'approved' | 'rejected';
  validatedBy?: Types.ObjectId;
  validatedAt?: Date;
  validationNotes?: string;
  reasonForLessProduction?: string;
  targetQuantity: number;
  startTime: Date;
  endTime?: Date;
  checkinTime?: Date;
  checkoutTime?: Date;
  workHours?: number;
  stageOrder?: number;
  location?: ILocation;
}

// Report Types
export interface IDateRange {
  start: Date;
  end: Date;
}

export interface IReportFilters {
  productId?: string;
  processId?: string;
  employeeId?: string;
}

export interface IReport extends BaseDocument {
  factoryId: Types.ObjectId;
  generatedBy: Types.ObjectId;
  type: 'production' | 'efficiency' | 'rejection' | 'attendance';
  dateRange: IDateRange;
  filters: IReportFilters;
  data: any;
}

// Dashboard Types
export interface ITrend {
  date: string;
  production: number;
  efficiency: number;
  rejection: number;
}

export interface IDashboardStats {
  totalProduction: number;
  efficiency: number;
  rejectionRate: number;
  activeEmployees: number;
  pendingValidations?: number;
  trends: ITrend[];
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  status: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Auth Types
export interface LoginRequest {
  email?: string;
  userId?: string;
  password: string;
  deviceId?: string;
}

export interface LoginResponse {
  user: IUser & { factory?: any };
  accessToken: string;
  refreshToken?: string; // Optional - sent in httpOnly cookie for security
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken?: string; // Optional - sent in httpOnly cookie for security
}

// JWT Payload
export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  factoryId?: string;
  type: 'access' | 'refresh';
  iat?: number; // Issued at (automatically added by jwt.sign)
  exp?: number; // Expiration time (automatically added by jwt.sign)
  jti?: string; // JWT ID (optional, can be added for token identification)
}

// Request Types
export interface AuthenticatedRequest extends Request {
  user?: IUser;
  factoryId?: string;
}

// Alias for AuthRequest (same as AuthenticatedRequest)
// This is used in controllers for consistency
export type AuthRequest = AuthenticatedRequest;

// Process Stages Summary Types
export interface ProcessStagesSummaryItem {
  processId: string;
  processName: string;
  stageOrder: number;
  achievedQuantity: number;
  rejectedQuantity: number;
  availableQuantity: number;
  workEntryCount: number;
  targetQuantity: number;
  efficiency: number;
  latestEntry?: Date;
}

export interface ProductSummary {
  productId: string;
  productName: string;
  productCode: string;
  processes: ProcessStagesSummaryItem[];
  totals: {
    totalAchieved: number;
    totalRejected: number;
    totalAvailable: number;
  };
}

export interface ProcessSummary {
  processId: string;
  processName: string;
  stageOrder: number;
  products: {
    productId: string;
    productName: string;
    productCode: string;
    achievedQuantity: number;
    rejectedQuantity: number;
    availableQuantity: number;
    workEntryCount: number;
    targetQuantity: number;
    efficiency: number;
    latestEntry?: Date;
  }[];
  totals: {
    totalAchieved: number;
    totalRejected: number;
    totalAvailable: number;
  };
}

export interface ProcessStagesSummaryReport {
  viewType: 'product' | 'process';
  products?: ProductSummary[];
  processes?: ProcessSummary[];
  grandTotals: {
    totalAchieved: number;
    totalRejected: number;
    totalAvailable: number;
  };
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

// WebSocket Types
export interface WebSocketMessage {
  type: string;
  data: any;
  userId?: string;
  factoryId?: string;
}

export interface WebSocketClient {
  id: string;
  userId: string;
  factoryId?: string;
  ws: any;
}

// Product Process Stages Types
export interface ProcessStageData {
  processId: string;
  processName: string;
  stageOrder: number;
  achievedQuantity: number;
  rejectedQuantity: number;
  availableQuantity: number;
  targetQuantity: number;
  efficiency: number;
  workEntryCount: number;
  latestEntry?: Date;
  activeWorkSessions?: number;
}

export interface ProductProcessStagesData {
  productId: string;
  productName: string;
  productCode: string;
  processes: ProcessStageData[];
  totals: {
    totalAchieved: number;
    totalRejected: number;
    totalAvailable: number;
    totalTarget: number;
  };
}

export interface ActiveWorkSession {
  productId: string;
  productName: string;
  processId: string;
  processName: string;
  employeeName: string;
  startTime: Date;
  currentAchieved: number;
  currentRejected: number;
}

export interface ProductProcessStagesReport {
  products: ProductProcessStagesData[];
  grandTotals: {
    totalAchieved: number;
    totalRejected: number;
    totalAvailable: number;
    totalTarget: number;
  };
  activeSessions: ActiveWorkSession[];
  lastUpdated: string;
  realtime: boolean;
}
