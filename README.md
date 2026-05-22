# Exhibition Data Collection Server Version

This version works on all phones together because data is saved in one PostgreSQL database.

## Default login

Admin:
- Username: admin
- Password: admin@123

Employee:
- user1 / rock@123
- user2 to user10 / hello

## Railway setup

1. Upload all files to GitHub.
2. Railway → New Project → Deploy from GitHub.
3. Add PostgreSQL database in Railway.
4. Railway will automatically add DATABASE_URL.
5. Optional: add environment variables:
   - ADMIN_USERNAME
   - ADMIN_PASSWORD
6. Redeploy.

## Important

Do not show admin login details on the front-end. They are not displayed in the page.
Change ADMIN_USERNAME and ADMIN_PASSWORD from Railway Variables for better security.