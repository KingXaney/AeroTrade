import {Document, model, models, Schema} from "mongoose";

export interface FriendshipDoc extends Document {
    requesterId: string;
    addresseeId: string;
    status: 'pending' | 'accepted';
    createdAt: Date;
    updatedAt: Date;
}

const FriendshipSchema = new Schema<FriendshipDoc>(
    {
        requesterId: {type: String, required: true, index: true},
        addresseeId: {type: String, required: true, index: true},
        status: {type: String, required: true, enum: ['pending', 'accepted'], default: 'pending'},
    },
    {timestamps: true},
);

// One relationship record per ordered (requester, addressee) pair.
FriendshipSchema.index({requesterId: 1, addresseeId: 1}, {unique: true});

const Friendship = models?.Friendship || model<FriendshipDoc>('Friendship', FriendshipSchema);

export default Friendship;
