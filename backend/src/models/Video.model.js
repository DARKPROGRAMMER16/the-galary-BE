import mongoose from 'mongoose';

const videoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    filePath: { type: String, required: true },
    fileSize: { type: Number, required: true },
    mimeType: { type: String, required: true },
    duration: { type: Number, default: 0 },
    resolution: {
      width: { type: Number, default: 0 },
      height: { type: Number, default: 0 },
    },
    codec: {
      type: String,
      default: 'unknown',
    },
    fps: {
      type: Number,
      default: 0,
    },
    bitrate: {
      type: Number,
      default: 0,
    },
    hasAudio: {
      type: Boolean,
      default: false,
    },
    thumbnailPath: {
      type: String,
      default: null,
    },
    isValidVideo: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'safe', 'flagged', 'error'],
      default: 'pending',
    },
    processingProgress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    sensitivityScore: {
      type: Number,
      default: null,
      min: 0,
      max: 1,
    },
    sensitivityDetails: {
      violence: { type: Number, default: 0 },
      adult: { type: Number, default: 0 },
      hate: { type: Number, default: 0 },
    },
    tags: [{ type: String, trim: true }],
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    organisation: { type: String, required: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Automatically exclude soft-deleted documents from all queries
videoSchema.pre(/^find/, function (next) {
  this.find({ isDeleted: { $ne: true } });
  next();
});

// Compound indexes for performance
videoSchema.index({ organisation: 1, status: 1, createdAt: -1 });
videoSchema.index({ uploadedBy: 1, createdAt: -1 });

const Video = mongoose.model('Video', videoSchema);
export default Video;
