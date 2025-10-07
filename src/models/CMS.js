import mongoose from 'mongoose';

const faqSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      trim: true,
    },
    answer: {
      type: String,
      trim: true,
    },
  },
  { _id: false },
);

const cmsSchema = new mongoose.Schema(
  {
    page: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    content: {
      type: String,
      trim: true,
    },
    faqs: [faqSchema],
    images: [
      {
        type: String,
      },
    ],
    icon: {
      type: String,
    },
  },
  { timestamps: true },
);

export default mongoose.model('CMS', cmsSchema);
