import Attendance from '@/models/Attendance';
import User from '@/models/User';
import WorkEntry from '@/models/WorkEntry';

export const markAbsentEmployees = async (): Promise<{
  markedAbsent: number;
  alreadyMarked: number;
  totalEmployees: number;
}> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Get all active employees
  const employees = await User.find({
    role: 'employee',
    isActive: true
  });

  let markedAbsent = 0;
  let alreadyMarked = 0;

  for (const employee of employees) {
    // Check if employee already has attendance for today
    const existingAttendance = await Attendance.findOne({
      employeeId: employee._id,
      $or: [
        {
          date: {
            $gte: today,
            $lt: tomorrow
          }
        },
        {
          createdAt: {
            $gte: today,
            $lt: tomorrow
          }
        }
      ]
    });

    if (existingAttendance) {
      console.log(`🔍 Employee ${employee.profile.firstName} ${employee.profile.lastName} already has attendance for today`);
      alreadyMarked++;
      continue;
    }

    // Check if employee has any work entries for today
    const workEntries = await WorkEntry.find({
      employeeId: employee._id,
      startTime: {
        $gte: today,
        $lt: tomorrow
      }
    });

    if (workEntries.length > 0) {
      console.log(`🔍 Employee ${employee.profile.firstName} ${employee.profile.lastName} has work entries for today, skipping absent marking`);
      continue;
    }

    // Mark employee as absent
    // Note: checkIn.time is required, so we use today's date as placeholder
    // The status field indicates the employee is absent
    const absentAttendance = new Attendance({
      employeeId: employee._id,
      factoryId: employee.factoryId,
      date: today,
      checkIn: {
        time: today, // Use start of day as placeholder (required field)
        location: {
          latitude: 0,
          longitude: 0
        },
        isWithinGeofence: false
      },
      shiftType: 'morning', // Default shift
      processId: employee.factoryId, // Use factoryId as fallback (processId is required)
      target: 0,
      status: 'absent'
    });

    await absentAttendance.save();
    console.log(`✅ Marked employee ${employee.profile.firstName} ${employee.profile.lastName} as absent`);
    markedAbsent++;
  }

  return {
    markedAbsent,
    alreadyMarked,
    totalEmployees: employees.length
  };
};
