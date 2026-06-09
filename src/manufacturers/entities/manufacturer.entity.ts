import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ObjectId } from 'mongodb';

@Entity('manufacturers')
export class Manufacturer {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  name: string;

  @Column()
  slug: string; // unique, lowercase, kebab-case

  @Column({ nullable: true })
  description: string;

  // Logo upload qua endpoint POST /manufacturers/:id/logo
  @Column({ nullable: true })
  logo: { url: string; publicId: string } | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
