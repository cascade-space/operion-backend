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
    const absentAttendance = new Attendance({
      employeeId: employee._id,
      factoryId: employee.factoryId,
      date: today,
      checkIn: {
        time: null,
        location: null,
        isWithinGeofence: false,
        status: 'absent'
      },
      shiftType: 'morning', // Default shift
      processId: null, // No process assignment required
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
