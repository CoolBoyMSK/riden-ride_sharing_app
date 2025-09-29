import mongoose from 'mongoose';

const contentBlockSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['text', 'image'], // Add more types in the future: video, table, etc.
      required: true,
    },
    content: {
      type: String, // For text: the actual text, for image: image URL
      required: true,
    },
  },
  { _id: false },
); // prevent nested _id

const cmsSchema = new mongoose.Schema(
  {
    page: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    blocks: {
      type: [contentBlockSchema],
      default: [],
      validate: [(val) => val.length > 0, 'Content cannot be empty'],
    },
  },
  { timestamps: true },
);

export default mongoose.model('CMS', cmsSchema);
