#!/bin/bash
# MongoDB Installation and Configuration Script
# For Ubuntu 22.04 and Amazon Linux 2023

set -e  # Exit on error

echo "=========================================="
echo "MongoDB Installation Script"
echo "=========================================="

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "Cannot detect OS. Exiting."
    exit 1
fi

echo "Detected OS: $OS"

# Install MongoDB
if [ "$OS" = "ubuntu" ]; then
    echo "Installing MongoDB for Ubuntu..."
    
    # Import MongoDB GPG key
    curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
    
    # Add MongoDB repository
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
    
    # Update and install
    sudo apt update
    sudo apt install -y mongodb-org
    
elif [ "$OS" = "amzn" ] || [ "$OS" = "rhel" ]; then
    echo "Installing MongoDB for Amazon Linux..."
    
    # Create MongoDB repository file
    sudo tee /etc/yum.repos.d/mongodb-org-7.0.repo > /dev/null <<EOF
[mongodb-org-7.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/amazon/2023/mongodb-org/7.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-7.0.asc
EOF
    
    # Install MongoDB
    sudo yum install -y mongodb-org
fi

# Start and enable MongoDB
echo "Starting MongoDB service..."
sudo systemctl start mongod
sudo systemctl enable mongod

# Wait for MongoDB to be ready
echo "Waiting for MongoDB to start..."
sleep 5

# Check MongoDB status
if sudo systemctl is-active --quiet mongod; then
    echo "✓ MongoDB is running"
else
    echo "✗ MongoDB failed to start"
    sudo systemctl status mongod
    exit 1
fi

# Configure MongoDB (bind to localhost only)
echo "Configuring MongoDB..."
MONGO_CONFIG="/etc/mongod.conf"

# Backup original config
sudo cp $MONGO_CONFIG ${MONGO_CONFIG}.backup

# Update bindIp to localhost (for security)
if [ "$OS" = "ubuntu" ]; then
    sudo sed -i 's/#bindIp: 127.0.0.1/bindIp: 127.0.0.1/' $MONGO_CONFIG
elif [ "$OS" = "amzn" ] || [ "$OS" = "rhel" ]; then
    # For Amazon Linux, config might be different
    sudo sed -i 's/bindIp:.*/bindIp: 127.0.0.1/' $MONGO_CONFIG
fi

# Create admin user
echo ""
echo "=========================================="
echo "Creating MongoDB Users"
echo "=========================================="
echo ""
echo "Please provide the following:"
read -sp "MongoDB Admin Password: " ADMIN_PASSWORD
echo ""
read -sp "Operion App Password: " APP_PASSWORD
echo ""
read -p "Database Name (default: operion_prod): " DB_NAME
DB_NAME=${DB_NAME:-operion_prod}

# Create users via MongoDB shell
echo "Creating MongoDB users..."
mongosh --eval "
db = db.getSiblingDB('admin');
db.createUser({
  user: 'admin',
  pwd: '$ADMIN_PASSWORD',
  roles: [{ role: 'userAdminAnyDatabase', db: 'admin' }, 'readWriteAnyDatabase']
});

db = db.getSiblingDB('$DB_NAME');
db.createUser({
  user: 'operion_app',
  pwd: '$APP_PASSWORD',
  roles: [{ role: 'readWrite', db: '$DB_NAME' }]
});
" || {
    echo "Warning: User creation may have failed. You may need to create users manually."
}

# Enable authentication
echo "Enabling MongoDB authentication..."
sudo sed -i '/security:/a\  authorization: enabled' $MONGO_CONFIG || {
    # If security section doesn't exist, add it
    echo "security:" | sudo tee -a $MONGO_CONFIG
    echo "  authorization: enabled" | sudo tee -a $MONGO_CONFIG
}

# Restart MongoDB
echo "Restarting MongoDB with authentication enabled..."
sudo systemctl restart mongod
sleep 5

# Test connection
echo "Testing MongoDB connection..."
mongosh -u operion_app -p "$APP_PASSWORD" --authenticationDatabase "$DB_NAME" --eval "db.getName()" > /dev/null 2>&1 && {
    echo "✓ MongoDB authentication working"
} || {
    echo "✗ MongoDB authentication test failed"
    echo "You may need to manually verify users were created correctly"
}

# Save connection string
CONNECTION_STRING="mongodb://operion_app:${APP_PASSWORD}@localhost:27017/${DB_NAME}?authSource=${DB_NAME}"
echo ""
echo "=========================================="
echo "MongoDB Setup Complete!"
echo "=========================================="
echo ""
echo "Connection String (save this for .env file):"
echo "$CONNECTION_STRING"
echo ""
echo "Database: $DB_NAME"
echo "Username: operion_app"
echo ""
echo "IMPORTANT: Save the connection string above!"
echo ""
echo "Next steps:"
echo "1. Add this to your Backend/.env file:"
echo "   MONGODB_URI_PROD=$CONNECTION_STRING"
echo ""
echo "2. Test connection from Node.js application"
echo ""

