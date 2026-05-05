import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: MongoRepository<User>,
  ) {}

  async create(createUserData: Partial<User>): Promise<User> {
    const user = this.usersRepository.create(createUserData);
    return this.usersRepository.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email: email.toLowerCase() },
    });
  }

  async findById(id: string): Promise<User | null> {
    try {
      return this.usersRepository.findOne({
        where: { _id: new ObjectId(id) },
      });
    } catch {
      return null;
    }
  }

  async findAll(): Promise<Omit<User, 'password'>[]> {
    const users = await this.usersRepository.find();
    // Loại bỏ trường password trước khi trả về
    return users.map(({ password: _pwd, ...rest }) => rest as Omit<User, 'password'>);
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<{ message: string; user: Omit<User, 'password'> }> {
    let objectId: ObjectId;
    try {
      objectId = new ObjectId(id);
    } catch {
      throw new NotFoundException('ID không hợp lệ');
    }

    const user = await this.usersRepository.findOne({ where: { _id: objectId } });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    Object.assign(user, updateUserDto);
    const saved = await this.usersRepository.save(user);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pwd, ...rest } = saved as any;
    return { message: 'Cập nhật thành công', user: rest };
  }

  async remove(id: string): Promise<void> {
    let objectId: ObjectId;
    try {
      objectId = new ObjectId(id);
    } catch {
      throw new NotFoundException('ID không hợp lệ');
    }

    const user = await this.usersRepository.findOne({ where: { _id: objectId } });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    await this.usersRepository.remove(user);
  }
}
