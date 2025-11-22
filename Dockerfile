# Use an official Python runtime as a parent image
FROM python:3.9-slim-buster

# Set the working directory in the container
WORKDIR /app

# Copy the current directory contents into the container at /app
COPY . /app

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Expose port 5000 for the Flask application
EXPOSE 5000

# Define environment variable for Flask
ENV FLASK_APP=api/index.py

# Run the Flask application
# Using Gunicorn for production deployment
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "api.index:app"]
