# Build the image. '--load .' tells it to load the image into the local Docker registry
docker buildx build --platform linux/amd64 -f docker/default.Dockerfile --target linkding -t linkding:custom --load .

# Save image to tar file, needs to be loaded on Unraid
docker save linkding:custom -o ../linkding-custom.tar

# Use this command to load the image on Unraid (don't run it here)
# docker load -i linkding-custom.tar