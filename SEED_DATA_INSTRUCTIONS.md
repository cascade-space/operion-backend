# Database Seeding Instructions

## Problem
The factory admin dashboard is showing all zeros because there's no data in the database.

## Solution
Run the seed script to populate the database with sample data.

## Steps

### 1. Start the Backend Server
```bash
cd Backend
npm run dev
```

### 2. Run the Seed Script
In a new terminal window:
```bash
cd Backend
npm run seed
```

### 3. Login Credentials
After seeding, you can use these credentials to test the dashboard:

**Super Admin:**
- Email: `vaibhavbg8080@gmail.com`
- Password: `9874563210`

**Factory Admin:**
- Email: `admin@sanagam.com` or `admin@sangam.com`
- Password: `admin123`

**Supervisor:**
- Username: `supervisor001`
- Password: `supervisor123`

**Employees:**
- Username: `emp001`, `emp002`, `emp003`
- Password: `emp123`

## What the Seed Script Creates

- **1 Factory**: Sanagam Manufacturing
- **1 Super Admin**: For system administration
- **1 Factory Admin**: For factory management
- **1 Supervisor**: For process supervision
- **3 Employees**: For production work
- **4 Sizes**: S, M, L, XL
- **3 Machines**: Cutting, Assembly, Packaging
- **3 Products**: Widget A, B, C
- **3 Processes**: Cutting, Assembly, Packaging
- **Work Entries**: 7 days of production data
- **Attendance Records**: 7 days of attendance data

## Dashboard Data
After seeding, the dashboard will show:
- **Total Production**: Sum of all achieved production
- **Efficiency**: Percentage of target achieved
- **Rejection Rate**: Percentage of rejected items
- **Active Employees**: Number of active employees
- **Products**: Total number of products
- **Processes**: Total number of processes
- **Attendance**: Current attendance status

## Troubleshooting

If the dashboard still shows zeros after seeding:

1. **Check Backend Logs**: Look for any errors in the backend console
2. **Verify Database Connection**: Ensure MongoDB is running
3. **Check User Authentication**: Make sure you're logged in as a factory admin
4. **Refresh Dashboard**: Use the refresh button on the dashboard
5. **Check Browser Console**: Look for any API errors in the browser developer tools

## Resetting Data

To clear all data and start fresh:
```bash
cd Backend
npm run seed
```
The seed script will clear existing data before creating new sample data.
