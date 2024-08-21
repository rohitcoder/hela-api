FROM node

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package.json /app
RUN npm install

# Bundle app source
COPY . /app

# Expose the port the app runs on
EXPOSE 4001

# Run the app
CMD ["npm", "start"]