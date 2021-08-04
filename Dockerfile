FROM node:14.8.0-alpine
COPY . .
RUN npm install
EXPOSE 5200
CMD ["npm", "start"]
