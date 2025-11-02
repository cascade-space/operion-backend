import mongoose, { Schema, Document, Model } from 'mongoose';
import { IAttendance, ILocation, ICheckIn, ICheckOut } from '@/types';

export interface AttendanceDocument extends IAttendance {}

export interface AttendanceModel extends Model<AttendanceDocument> {
  findByEmployee(employeeId: mongoose.Types.ObjectId, date?: Date): Promise<AttendanceDocument[]>;
  findByFactory(factoryId: mongoose.Types.ObjectId, date?: Date): Promise<AttendanceDocument[]>;
  findTodayAttendance(factoryId: mongoose.Types.ObjectId): Promise<AttendanceDocument[]>;
}

const attendanceSchema = new Schema<AttendanceDocument>({
  employeeId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  factoryId: {
    type: Schema.Types.ObjectId,
    ref: 'Factory',
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  checkIn: {
    time: {
      type: Date,
      required: true
    },
    location: {
      latitude: {
        type: Number,
        required: true
      },
      longitude: {
        type: Number,
        required: true
      },

    },
    isWithinGeofence: {
      type: Boolean,
      required: true
    }
  },
  checkOut: {
    time: {
      type: Date
    },
    location: {
      latitude: Number,
      longitude: Number,

    }
  },
  shiftType: {
    type: String,
    required: true,
    trim: true
  },
  processId: {
    type: Schema.Types.ObjectId,
    ref: 'Process',
    required: true
  },
  target: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['present', 'absent', 'half-day'] as const,
    default: 'present'
  }
}, {
  timestamps: true
});

// Indexes for performance
attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ factoryId: 1, date: -1 }); // Date-based queries (descending)
attendanceSchema.index({ employeeId: 1, date: -1 }); // Employee attendance history
attendanceSchema.index({ factoryId: 1, createdAt: -1 }); // Recent attendance queries
attendanceSchema.index({ processId: 1, date: -1 }); // Process-based attendance reports
attendanceSchema.index({ status: 1 });

// Virtual for work duration
attendanceSchema.virtual('workDuration').get(function(this: AttendanceDocument): number | null {
  if (!this.checkOut?.time) return null;
  return this.checkOut.time.getTime() - this.checkIn.time.getTime();
});

// Virtual for work hours
attendanceSchema.virtual('workHours').get(function(this: AttendanceDocument): number | null {
  if (!this.checkOut?.time) return null;
  const duration = this.checkOut.time.getTime() - this.checkIn.time.getTime();
  return duration / (1000 * 60 * 60); // Convert to hours
});

// Instance method to perform check out
attendanceSchema.methods.performCheckOut = function(this: AttendanceDocument, time: Date, location: ILocation): Promise<AttendanceDocument> {
  this.checkOut = {
    time,
    location
  };
  return this.save();
};

// Instance method to update status
attendanceSchema.methods.updateStatus = function(this: AttendanceDocument, status: 'present' | 'absent' | 'half-day'): Promise<AttendanceDocument> {
  this.status = status;
  return this.save();
};

// Instance method to calculate work hours
attendanceSchema.methods.calculateWorkHours = function(this: AttendanceDocument): number {
  if (!this.checkIn?.time || !this.checkOut?.time) return 0;
  const duration = this.checkOut.time.getTime() - this.checkIn.time.getTime();
  return duration / (1000 * 60 * 60); // Convert to hours
};

// Static method to find attendance by employee
attendanceSchema.statics.findByEmployee = function(employeeId: mongoose.Types.ObjectId, date?: Date): Promise<AttendanceDocument[]> {
  const query: any = { employeeId };
  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    query.date = { $gte: startOfDay, $lte: endOfDay };
  }
  return this.find(query).populate('processId').sort({ date: -1 });
};

// Static method to find attendance by factory
attendanceSchema.statics.findByFactory = function(factoryId: mongoose.Types.ObjectId, date?: Date): Promise<AttendanceDocument[]> {
  const query: any = { factoryId };
  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    query.date = { $gte: startOfDay, $lte: endOfDay };
  }
  return this.find(query).populate(['employeeId', 'processId']).sort({ date: -1 });
};

// Static method to find today's attendance
attendanceSchema.statics.findTodayAttendance = function(factoryId: mongoose.Types.ObjectId): Promise<AttendanceDocument[]> {
  const today = new Date();
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  return this.find({
    factoryId,
    date: { $gte: startOfDay, $lte: endOfDay }
  }).populate(['employeeId', 'processId']).sort({ 'checkIn.time': 1 });
};

const Attendance = mongoose.model<AttendanceDocument, AttendanceModel>('Attendance', attendanceSchema);

export default Attendance;
